import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {buildProvisioningSql,buildCatalogSeedSql,validateCatalog,DATASET_ID,BUCKET_ID} from '../prepare-additive-seed.mjs';

// Tests the existing RPC bodies locally. Auth/storage boundaries are fixtures;
// this does not claim hosted Auth, REST or Storage verification.
const meta={title:'YSG local verification fixture',pdfSha256:'a'.repeat(64),sourceHwpxSha256:'b'.repeat(64),pageCount:3,footnoteCount:2};
const rows=[{kind:'paragraph',targetId:'P0001',originalText:'YSG 원문 본문',page:2,printedPage:'1',label:'본문'},
  {kind:'footnote',targetId:'fn-001',originalText:'YSG 원문 각주 1',page:2},
  {kind:'footnote',targetId:'fn-002',originalText:'YSG 원문 각주 2',page:3}];

test('additive preparation refuses unverified metadata and incomplete originals',()=>{
  for(const changed of [{pdfSha256:''},{pageCount:0},{footnoteCount:1000},{title:''}])assert.throws(()=>buildProvisioningSql({...meta,...changed}));
  assert.throws(()=>validateCatalog(rows.slice(0,2),meta));
  assert.throws(()=>validateCatalog([...rows,rows[0]],meta));
  assert.throws(()=>validateCatalog(rows.map(r=>({...r,page:4})),meta));
  const sql=buildProvisioningSql(meta);
  assert.doesNotMatch(sql,/create\s+(?:or\s+replace\s+)?(?:function|table|policy)|alter\s+|update\s+|delete\s+|drop\s+/i);
  assert.match(buildCatalogSeedSql(rows,meta),/seed_shared_catalog\('ysg-20261023'/);
});

test('existing review API isolates YSG dataset and preserves the other site',async t=>{
  const db=new PGlite();
  const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
  const other='template-baseline-fixture';
  let privateId,sharedId,otherNoteId,baseline,functions;
  const query=async(sql,args=[])=> (await db.query(sql,args)).rows;
  const call=async(name,args)=> (await query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args))[0].result;
  const fail=async(p,code)=>assert.rejects(p,e=>{assert.equal(e.code,code);return true;});
  async function actor(role,id){await db.exec('reset role');await query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,...(id?{sub:id}:{})})]);await db.exec(`set role ${role}`);}
  async function snapshot(){return {
    dataset:await query('select * from public.paper_review_datasets where id=$1',[other]),
    notes:await query('select * from public.paper_review_notes where dataset_id=$1 order by id',[other]),
    catalog:await query('select * from paper_review_private.edit_catalog where dataset_id=$1 order by target_id',[other]),
    heads:await query('select * from paper_review_private.edit_heads where dataset_id=$1 order by target_id',[other]),
    history:await query('select * from paper_review_private.edit_revisions where dataset_id=$1 order by id',[other]),
    bucket:await query("select * from storage.buckets where id='existing-documents-fixture'")
  };}
  const functionSnapshot=()=>query("select n.nspname,p.proname,p.proacl::text,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','paper_review_private') order by n.nspname,p.proname");
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
      create schema storage;create table storage.buckets(id text primary key,name text not null,public boolean not null default false);
      insert into auth.users values('${A}'),('${B}');`);
    await db.exec(await readFile(new URL('./fixtures/notes.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('./fixtures/shared-edits.sql',import.meta.url),'utf8'));
    await query('insert into public.paper_review_datasets(id,title,thesis_sha256,source_hwp_sha256,page_count,footnote_count) values($1,$2,$3,$4,7,3)',[other,'Other site fixture','c'.repeat(64),'d'.repeat(64)]);
    await db.exec("insert into storage.buckets values('existing-documents-fixture','existing-documents-fixture',true)");
    await query('select paper_review_private.seed_shared_catalog($1,$2::jsonb)',[other,JSON.stringify([{kind:'paragraph',targetId:'P0001',originalText:'Other site original',page:1}])]);
    await actor('authenticated',A);
    otherNoteId=(await call('paper_review_create_note',[other,{text:'Other private note'}])).note.id;
    await call('paper_review_shared_save',[other,'paragraph','P0001',0,'Other edited body','preserve',null]);
    await actor('postgres');baseline=await snapshot();functions=await functionSnapshot();

    await t.test('provisioning is additive, idempotent and changes no existing RPC or data',async()=>{
      await db.exec(buildProvisioningSql(meta));await db.exec(buildProvisioningSql(meta));
      assert.deepEqual(await snapshot(),baseline);assert.deepEqual(await functionSnapshot(),functions);
      const dataset=(await query('select * from public.paper_review_datasets where id=$1',[DATASET_ID]))[0];
      assert.equal(dataset.thesis_sha256,meta.pdfSha256);assert.equal(dataset.source_hwp_sha256,meta.sourceHwpxSha256);
      assert.equal((await query('select public from storage.buckets where id=$1',[BUCKET_ID]))[0].public,true);
      await assert.rejects(db.exec(buildProvisioningSql({...meta,pageCount:4})),/different metadata/);await db.exec('rollback');
      assert.equal((await query('select page_count from public.paper_review_datasets where id=$1',[DATASET_ID]))[0].page_count,3);
    });
    await t.test('catalog seed is complete, repeatable and refuses changes to original text',async()=>{
      await db.exec(buildCatalogSeedSql(rows,meta));await db.exec(buildCatalogSeedSql(rows,meta));
      assert.equal((await query('select count(*)::int n from paper_review_private.edit_catalog where dataset_id=$1',[DATASET_ID]))[0].n,3);
      await fail(query('select paper_review_private.seed_shared_catalog($1,$2::jsonb)',[DATASET_ID,JSON.stringify([{...rows[0],originalText:'Overwrite'}])]),'PT409');
      await fail(query('select paper_review_private.seed_shared_catalog($1,$2::jsonb)',[DATASET_ID,JSON.stringify([{...rows[1],targetId:'fn-003'}])]),'PT400');
      assert.deepEqual(await snapshot(),baseline);
    });
    await t.test('anonymous reads are dataset-scoped; raw access, seeding and mutation are denied',async()=>{
      await actor('anon');
      assert.deepEqual((await call('paper_review_list_notes',[DATASET_ID,null,false])).notes,[]);
      assert.equal((await call('paper_review_shared_catalog',[DATASET_ID,0,200])).totalCount,3);
      assert.deepEqual((await call('paper_review_shared_list',[DATASET_ID])).overrides,[]);
      await fail(query('select * from public.paper_review_notes'),'42501');
      await fail(query('select * from paper_review_private.edit_catalog'),'42501');
      await fail(query('select paper_review_private.seed_shared_catalog($1,$2::jsonb)',[DATASET_ID,JSON.stringify(rows)]),'42501');
      await fail(call('paper_review_create_note',[DATASET_ID,{text:'attack'}]),'42501');
      await fail(call('paper_review_shared_save',[DATASET_ID,'paragraph','P0001',0,'attack','',null]),'42501');
    });
    await t.test('private and shared notes retain owner control and reject cross-dataset anchors',async()=>{
      await actor('authenticated',A);
      const n=(await call('paper_review_create_note',[DATASET_ID,{text:'YSG private',anchorType:'footnote',page:3,noteId:'fn-002'}])).note;
      privateId=n.id;assert.equal(n.visibility,'private');assert.equal(n.editable,true);
      assert.equal('ownerId'in n||'owner_id'in n,false);
      sharedId=(await call('paper_review_create_note',[DATASET_ID,{text:'YSG shared',visibility:'shared'}])).note.id;
      await fail(call('paper_review_update_note',[DATASET_ID,otherNoteId,{revision:1,text:'cross dataset'}]),'PT404');
      await fail(call('paper_review_create_note',[DATASET_ID,{text:'bad note',noteId:'fn-003'}]),'PT400');
      await fail(call('paper_review_create_note',[DATASET_ID,{text:'bad page',anchorType:'thesis',page:4}]),'PT400');
      await fail(call('paper_review_create_note',[DATASET_ID,{text:'injection',owner_id:B}]),'PT400');
      await actor('authenticated',B);
      const visible=(await call('paper_review_list_notes',[DATASET_ID,null,false])).notes;
      assert.deepEqual(visible.map(n=>n.id),[sharedId]);assert.equal(visible[0].editable,false);
      for(const id of [privateId,sharedId]){
        await fail(call('paper_review_update_note',[DATASET_ID,id,{revision:1,text:'hijack'}]),'PT404');
        await fail(call('paper_review_delete_note',[DATASET_ID,id,{revision:1}]),'PT404');
      }
    });
    await t.test('note revisions are atomic, stale writes fail, and anonymous export omits private notes',async()=>{
      await actor('authenticated',A);
      assert.equal((await call('paper_review_update_note',[DATASET_ID,privateId,{revision:1,text:'Updated'}])).note.revision,2);
      await fail(call('paper_review_update_note',[DATASET_ID,privateId,{revision:1,text:'stale'}]),'PT409');
      await fail(call('paper_review_delete_note',[DATASET_ID,privateId,{revision:1}]),'PT409');
      await actor('anon');assert.deepEqual((await call('paper_review_list_notes',[DATASET_ID,null,true])).notes.map(n=>n.id),[sharedId]);
      await actor('authenticated');await fail(call('paper_review_create_note',[DATASET_ID,{text:'identity missing'}]),'PT401');
    });
    await t.test('different visitors edit YSG shared text; conflict and restore preserve full history',async()=>{
      await actor('authenticated',A);
      assert.equal((await call('paper_review_shared_save',[DATASET_ID,'paragraph','P0001',0,'First edit','reason',null])).edit.revision,1);
      await actor('authenticated',B);
      assert.equal((await call('paper_review_shared_save',[DATASET_ID,'paragraph','P0001',1,'Second edit','reason',null])).edit.revision,2);
      await fail(call('paper_review_shared_save',[DATASET_ID,'paragraph','P0001',1,'stale','',null]),'PT409');
      await fail(call('paper_review_shared_save',[DATASET_ID,'paragraph','P9999',0,'unknown','',null]),'PT404');
      const restore=(await call('paper_review_shared_save',[DATASET_ID,'paragraph','P0001',2,null,'Restore',0])).edit;
      assert.equal(restore.revision,3);assert.equal(restore.text,rows[0].originalText);
      const deleted=(await call('paper_review_shared_save',[DATASET_ID,'footnote','fn-001',0,'','Delete',null])).edit;
      assert.equal(deleted.text,'');
      await actor('authenticated');await fail(call('paper_review_shared_save',[DATASET_ID,'paragraph','P0001',3,'no identity','',null]),'PT401');
    });
    await t.test('history and snapshot export stay complete and exclude the other dataset',async()=>{
      await actor('anon');const h=await call('paper_review_shared_history',[DATASET_ID,'paragraph','P0001',null,2]);
      assert.equal(h.original.text,rows[0].originalText);assert.deepEqual(h.revisions.map(r=>r.revision),[3,2]);assert.equal(h.hasMore,true);
      const tail=await call('paper_review_shared_history',[DATASET_ID,'paragraph','P0001',h.nextBeforeRevision,2]);
      assert.deepEqual(tail.revisions.map(r=>r.revision),[1]);assert.equal(tail.hasMore,false);
      const first=await call('paper_review_shared_export',[DATASET_ID,'0',null,2]);assert.equal(first.totalCount,4);
      await actor('authenticated',A);await call('paper_review_shared_save',[DATASET_ID,'footnote','fn-002',0,'Later edit','',null]);
      await actor('anon');const all=[...first.revisions];let cursor=first.nextAfterId,more=first.hasMore;
      while(more){const p=await call('paper_review_shared_export',[DATASET_ID,cursor,first.snapshotId,2]);all.push(...p.revisions);cursor=p.nextAfterId;more=p.hasMore;}
      assert.equal(all.length,4);assert.equal(new Set(all.map(r=>r.id)).size,4);
      assert.ok(all.every(r=>r.datasetId===DATASET_ID));assert.equal(all.some(r=>r.text==='Later edit'),false);
      assert.equal(JSON.stringify(all).includes(A)||JSON.stringify(all).includes(B),false);
      assert.equal((await call('paper_review_shared_list',[DATASET_ID])).overrides.length,3);
    });
    await t.test('originals/history are immutable and every other-site row/RPC remains identical',async()=>{
      await actor('postgres');
      await fail(query('update paper_review_private.edit_catalog set original_text=$1 where dataset_id=$2',['tamper',DATASET_ID]),'PT403');
      await fail(query('delete from paper_review_private.edit_revisions where dataset_id=$1',[DATASET_ID]),'PT403');
      assert.deepEqual(await snapshot(),baseline);assert.deepEqual(await functionSnapshot(),functions);
    });
  }finally{await db.close();}
});
