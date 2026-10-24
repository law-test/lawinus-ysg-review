import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {buildProvisioningSql} from '../supabase/prepare-additive-seed.mjs';

// Runs the existing RPC bodies and roles in a local PostgreSQL WASM instance.
// auth.uid and storage.buckets are minimal Supabase boundary fixtures. This does
// not verify a live Supabase Auth flow, REST deployment, or hosted Storage policies.
test('PostgreSQL integration: execute existing RPC fixture, isolate private notes and enforce mutation ownership', async t => {
  const db = new PGlite();
  const actorA='10000000-0000-4000-8000-000000000001';
  const actorB='10000000-0000-4000-8000-000000000002';
  const dataset='ysg-20261023';
  let privateId,sharedId;
  const call=async(name,args)=> (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
  async function actor(role,id=null){
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,...(id?{sub:id}:{})})]);
    await db.exec(`set role ${role}`);
  }
  const mustFail=async(promise,code)=>{await assert.rejects(promise,e=>{assert.equal(e.code,code);return true;});};
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,aud text,role text,email text,is_anonymous boolean);
      create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    `);
    await db.exec(`grant usage on schema auth to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated,service_role;
      create schema storage;
      create table storage.buckets(id text primary key,name text not null,public boolean not null default false);
      insert into auth.users(id) values('${actorA}'),('${actorB}');`);
    const migration=await readFile(new URL('../supabase/tests/fixtures/notes.sql',import.meta.url),'utf8');
    await t.test('existing RPC fixture and additive provisioning preserve separate PDF/HWPX hashes',async()=>{
      await db.exec(migration);
      await db.exec(await readFile(new URL('../supabase/tests/fixtures/shared-edits.sql',import.meta.url),'utf8'));
      await db.exec(buildProvisioningSql({title:'YSG synthetic verification',pdfSha256:'a'.repeat(64),sourceHwpxSha256:'b'.repeat(64),pageCount:3,footnoteCount:2}));
      const row=(await db.query('select * from public.paper_review_datasets')).rows[0];
      assert.equal(row.thesis_sha256,'a'.repeat(64));
      assert.equal(row.source_hwp_sha256,'b'.repeat(64));
      assert.equal((await db.query("select public from storage.buckets where id='ysg-review-documents'")).rows[0].public,true);
      await db.exec(migration); // Idempotent rerun does not change baseline or note data.
    });
    await t.test('anon can list shared notes but cannot read raw table or call create RPC',async()=>{
      await actor('anon');
      assert.deepEqual((await call('paper_review_list_notes',[dataset,null,false])).notes,[]);
      await mustFail(db.query('select * from public.paper_review_notes'),'42501');
      await mustFail(call('paper_review_create_note',[dataset,{text:'anon attack'}]),'42501');
    });
    await t.test('A creates a default-private note and an explicitly shared note',async()=>{
      await actor('authenticated',actorA);
      const privateNote=(await call('paper_review_create_note',[dataset,{text:'A private',anchorType:'footnote',page:3,noteId:'fn-002'}])).note;
      privateId=privateNote.id;
      assert.equal(privateNote.visibility,'private');assert.equal(privateNote.editable,true);assert.equal(privateNote.revision,1);
      assert.equal(privateNote.datasetId,dataset);assert.equal(privateNote.page,3);
      assert.equal('owner_id' in privateNote || 'ownerId' in privateNote || 'userId' in privateNote,false);
      sharedId=(await call('paper_review_create_note',[dataset,{text:'A shared',visibility:'shared'}])).note.id;
      await mustFail(db.query('select * from public.paper_review_notes'),'42501');
      assert.equal((await call('paper_review_list_notes',[dataset,null,false])).notes.length,2);
    });
    await t.test('B sees only A shared note, cannot edit/delete either A note',async()=>{
      await actor('authenticated',actorB);
      const notes=(await call('paper_review_list_notes',[dataset,null,false])).notes;
      assert.equal(notes.length,1);assert.equal(notes[0].id,sharedId);assert.equal(notes[0].editable,false);
      for(const id of [privateId,sharedId]){
        await mustFail(call('paper_review_update_note',[dataset,id,{revision:1,text:'B attack'}]),'PT404');
        await mustFail(call('paper_review_delete_note',[dataset,id,{revision:1}]),'PT404');
      }
      await mustFail(call('paper_review_update_note',['other-dataset',sharedId,{revision:1,text:'B attack'}]),'PT404');
    });
    await t.test('A revision update is atomic, stale update/delete are rejected',async()=>{
      await actor('authenticated',actorA);
      const changed=(await call('paper_review_update_note',[dataset,privateId,{revision:1,text:'A changed',status:'resolved'}])).note;
      assert.equal(changed.revision,2);assert.equal(changed.text,'A changed');assert.equal(changed.status,'resolved');
      await mustFail(call('paper_review_update_note',[dataset,privateId,{revision:1,text:'stale'}]),'PT409');
      await mustFail(call('paper_review_delete_note',[dataset,privateId,{revision:1}]),'PT409');
      const notes=(await call('paper_review_list_notes',[dataset,'resolved',false])).notes;
      assert.equal(notes.length,1);assert.equal(notes[0].id,privateId);
    });
    await t.test('server rejects invalid input, foreign dataset anchors, owner injection and missing identity',async()=>{
      await actor('authenticated',actorA);
      const invalid=[{}, {text:''},{text:'  \n\t'}, {text:'x'.repeat(10001)}, {text:'ok',quote:'x'.repeat(4001)},
        {text:'ok',noteId:'fn-003'},{text:'ok',noteId:'fn-000'},{text:'ok',anchorType:'thesis',page:4},
        {text:'ok',page:1.5},{text:'ok',x:1.1,y:0.1},{text:'ok',x:0.2},{text:'ok',visibility:'public'},
        {text:'ok',status:'done'},{text:'ok',anchorType:'source'},{text:'ok',anchorType:'footnote'},
        {text:'ok',sourceId:'../private'},{text:'ok',owner_id:actorB},{text:'ok',text2:'unknown'},
        {text:null},{text:'ok',quote:null},{text:'ok',x:'0.1',y:0.2}];
      for(const input of invalid)await mustFail(call('paper_review_create_note',[dataset,input]),'PT400');
      await mustFail(call('paper_review_create_note',['other-dataset',{text:'bad dataset'}]),'PT404');
      await mustFail(call('paper_review_update_note',[dataset,privateId,{revision:2}]),'PT400');
      await mustFail(call('paper_review_update_note',[dataset,privateId,{revision:2.5,text:'bad rev'}]),'PT400');
      await actor('authenticated');
      await mustFail(call('paper_review_create_note',[dataset,{text:'missing identity'}]),'PT401');
    });
    await t.test('anon list/export never reveal A private note; owner can delete with latest revision',async()=>{
      await actor('anon');
      for(const exported of [false,true]){
        const notes=(await call('paper_review_list_notes',[dataset,null,exported])).notes;
        assert.equal(notes.length,1);assert.equal(notes[0].id,sharedId);assert.equal(notes[0].editable,false);
      }
      await actor('authenticated',actorA);
      assert.equal((await call('paper_review_delete_note',[dataset,privateId,{revision:2}])).deleted,privateId);
      await mustFail(call('paper_review_delete_note',[dataset,privateId,{revision:2}]),'PT404');
    });
    await t.test('5,000-row list cap reports truncation and 20,000-row export refuses overflow',async()=>{
      await actor('postgres');
      await db.query(`insert into public.paper_review_notes(dataset_id,owner_id,display_name,text,visibility)
        select $1,$2,'fixture','cap fixture','shared' from generate_series(1,20000)`,[dataset,actorA]);
      await actor('anon');
      const list=await call('paper_review_list_notes',[dataset,null,false]);
      assert.equal(list.notes.length,5000);assert.equal(list.truncated,true);
      await mustFail(call('paper_review_list_notes',[dataset,null,true]),'PT413');
    });
  } finally { await db.close(); }
});
