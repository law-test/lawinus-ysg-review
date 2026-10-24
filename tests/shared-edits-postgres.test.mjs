import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Actual schema/RPC execution in PostgreSQL WASM. Auth boundary is a fixture;
// hosted REST/anonymous Auth are verified separately, never inferred from this test.
test('shared document originals, permissions, revisions, conflict and complete export',async t=>{
 const db=new PGlite(); const dataset='ysg-20261023';
 const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
 const call=async(name,args)=>(await db.query(`select public.paper_review_shared_${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as r`,args)).rows[0].r;
 const fail=(p,code)=>assert.rejects(p,e=>{assert.equal(e.code,code);return true;});
 async function actor(role,id){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,...(id?{sub:id}:{})})]);await db.exec(`set role ${role}`);}
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
   grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
   create table public.paper_review_datasets(id text primary key,page_count integer,footnote_count integer);
   insert into public.paper_review_datasets values('ysg-20261023',3,2);
   create table public.existing_notes(id integer,text text);insert into public.existing_notes values(1,'preserve');`);
  const sql=await readFile(new URL('../supabase/tests/fixtures/shared-edits.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
  const rows=[{kind:'paragraph',targetId:'P0001',originalText:'원문 본문',page:2,printedPage:'1',label:'본문'},
   {kind:'footnote',targetId:'fn-001',originalText:'원문 각주',page:2,printedPage:'1',label:'각주 1'}];
  const seed=async(r)=>(await db.query('select paper_review_private.seed_shared_catalog($1,$2::jsonb) n',[dataset,JSON.stringify(r)])).rows[0].n;
  await t.test('catalog immutable, idempotent and constrained',async()=>{
   assert.equal(await seed(rows),2);assert.equal(await seed(rows),0);
   await fail(seed([{...rows[0],originalText:'replacement'}]),'PT409');
   await fail(seed([{...rows[1],targetId:'fn-003'}]),'PT400');
   await fail(db.exec("update paper_review_private.edit_catalog set original_text='x'"),'PT403');
  });
  await t.test('public reads; anonymous raw writes and seeding rejected',async()=>{
   await actor('anon');assert.equal((await call('catalog',[dataset,0,200])).totalCount,2);
   assert.deepEqual((await call('list',[dataset])).overrides,[]);
   await fail(db.query('select * from paper_review_private.edit_catalog'),'42501');
   await fail(seed(rows),'42501');
   await fail(call('save',[dataset,'paragraph','P0001',0,'attack','',null]),'42501');
  });
  await t.test('different visitors can edit the common text; stale changes cannot overwrite',async()=>{
   await actor('authenticated',A);
   const one=(await call('save',[dataset,'paragraph','P0001',0,'수정 1','근거 1',null])).edit;
   assert.equal(one.revision,1);assert.equal(one.action,'edit');assert.equal(one.text,'수정 1');
   assert.equal(JSON.stringify(one).includes(A),false);
   await actor('authenticated',B);
   const two=(await call('save',[dataset,'paragraph','P0001',1,'수정 2','근거 2',null])).edit;
   assert.equal(two.revision,2);assert.equal(two.parentRevision,1);
   await fail(call('save',[dataset,'paragraph','P0001',1,'stale','',null]),'PT409');
   await fail(call('save',[dataset,'paragraph','P9999',0,'unknown','',null]),'PT404');
   await fail(call('save',[dataset,'paragraph','P0001',2,'x'.repeat(100001),'',null]),'PT400');
   await fail(call('save',['other','paragraph','P0001',0,'cross dataset','',null]),'PT404');
   await actor('authenticated');await fail(call('save',[dataset,'paragraph','P0001',2,'no identity','',null]),'PT401');
  });
  await t.test('restoring originals or old revisions appends history; blank content is reversible',async()=>{
   await actor('authenticated',A);
   let row=(await call('save',[dataset,'paragraph','P0001',2,null,'원문 복원',0])).edit;
   assert.equal(row.revision,3);assert.equal(row.text,'원문 본문');assert.equal(row.restoredFromRevision,0);
   row=(await call('save',[dataset,'paragraph','P0001',3,null,'이전 수정 복원',1])).edit;
   assert.equal(row.revision,4);assert.equal(row.text,'수정 1');
   await fail(call('save',[dataset,'paragraph','P0001',4,null,'없는 이력',999]),'PT404');
   row=(await call('save',[dataset,'footnote','fn-001',0,'','각주 삭제 제안',null])).edit;
   assert.equal(row.revision,1);assert.equal(row.text,'');
   await db.exec('reset role');
   await fail(db.exec("update paper_review_private.edit_revisions set text='tamper'"),'PT403');
   await fail(db.exec('delete from paper_review_private.edit_revisions'),'PT403');
  });
  await t.test('history pagination preserves originals and export has a fixed snapshot',async()=>{
   await actor('anon');
   const h=await call('history',[dataset,'paragraph','P0001',null,2]);
   assert.equal(h.original.text,'원문 본문');assert.equal(h.currentRevision,4);
   assert.deepEqual(h.revisions.map(r=>r.revision),[4,3]);assert.equal(h.hasMore,true);
   const tail=await call('history',[dataset,'paragraph','P0001',h.nextBeforeRevision,2]);
   assert.deepEqual(tail.revisions.map(r=>r.revision),[2,1]);assert.equal(tail.hasMore,false);
   const first=await call('export',[dataset,'0',null,2]);assert.equal(first.totalCount,5);
   await actor('authenticated',B);await call('save',[dataset,'footnote','fn-001',1,'나중 수정','',null]);
   await actor('anon');const all=[...first.revisions];let cursor=first.nextAfterId,more=first.hasMore;
   while(more){const p=await call('export',[dataset,cursor,first.snapshotId,2]);all.push(...p.revisions);cursor=p.nextAfterId;more=p.hasMore;}
   assert.equal(all.length,5);assert.equal(new Set(all.map(r=>r.id)).size,5);
   assert.equal(all.some(r=>r.text==='나중 수정'),false);
   assert.equal(JSON.stringify(all).includes(A),false);assert.equal(JSON.stringify(all).includes(B),false);
   const current=await call('list',[dataset]);assert.equal(current.overrides.length,2);
   assert.equal(current.overrides.find(r=>r.kind==='footnote').text,'나중 수정');
   await db.exec('reset role');assert.deepEqual((await db.query('select * from public.existing_notes')).rows,[{id:1,text:'preserve'}]);
  });
  await t.test('paragraph deletion stores an empty revision and original restoration leaves that deletion in history',async()=>{
   await actor('authenticated',A);
   const deleted=(await call('save',[dataset,'paragraph','P0001',4,'','중복 문단 삭제',null])).edit;
   assert.equal(deleted.revision,5);assert.equal(deleted.text,'');
   const visible=(await call('list',[dataset])).overrides.find(row=>row.targetId==='P0001');
   assert.equal(visible.text,'');assert.equal(visible.revision,5);
   const restored=(await call('save',[dataset,'paragraph','P0001',5,null,'원문 복원',0])).edit;
   assert.equal(restored.revision,6);assert.equal(restored.text,'원문 본문');
   const history=await call('history',[dataset,'paragraph','P0001',null,10]);
   assert.equal(history.original.text,'원문 본문');
   assert.equal(history.revisions.find(row=>row.revision===5).text,'');
  });
 }finally{await db.close();}
});
