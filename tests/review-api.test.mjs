import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateReviewConfig, csvCell, renderNotesExport } from '../src/review-api.ts';

const config = { supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co', supabasePublishableKey: 'sb_publishable_fixture', storageBucket: 'ysg-review-documents', datasetId: 'ysg-20261023' };
const note = { id:'12345678-1234-1234-1234-123456789012',datasetId:'ysg-20261023',anchorType:'footnote',page:3,noteId:'fn-002',sourceId:'s-source',x:null,y:null,text:'법리 재검토',quote:'인용 구절',visibility:'private',status:'open',revision:1,displayName:'방문자 000001',createdAt:'2026-10-23T00:00:00Z',updatedAt:'2026-10-23T00:00:00Z',editable:true };
test('config accepts only an HTTPS Supabase project and public key',()=>{
  assert.deepEqual(validateReviewConfig(config),config);
  assert.equal(validateReviewConfig({...config,supabaseUrl:config.supabaseUrl+'/'}).supabaseUrl,config.supabaseUrl);
  for (const url of ['http://example.com','https://example.com','https://abc.supabase.co.evil.test']) assert.throws(()=>validateReviewConfig({...config,supabaseUrl:url}));
  for (const key of ['sb_secret_fixture','placeholder','']) assert.throws(()=>validateReviewConfig({...config,supabasePublishableKey:key}));
  for (const datasetId of ['../other','human/other','']) assert.throws(()=>validateReviewConfig({...config,datasetId}));
});
test('legacy anon JWT is allowed but legacy service_role JWT is refused',()=>{
  const key = role => `e30.${Buffer.from(JSON.stringify({role})).toString('base64url')}.signature`;
  assert.equal(validateReviewConfig({...config,supabasePublishableKey:key('anon')}).supabasePublishableKey,key('anon'));
  assert.throws(()=>validateReviewConfig({...config,supabasePublishableKey:key('service_role')}));
});
test('CSV protects formula-looking values, quotes and Korean line breaks',()=>{
  for(const value of ['=1+2','+1','-2','@SUM(1)','  =CMD()','\ttext','\ntext','\u0001+1']) assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell('정상 "문장"'),'"정상 ""문장"""');
  assert.equal(csvCell(null),'""');
});
test('exports retain baseline, note, PDF page, source and selected passage',()=>{
  const md=renderNotesExport([note],'md',config.datasetId);
  assert.match(md.text,/PDF 3쪽/);assert.match(md.text,/각주 fn-002/);assert.match(md.text,/ysg-20261023/);assert.match(md.text,/s-source/);assert.match(md.text,/> 인용 구절/);
  const csv=renderNotesExport([note],'csv',config.datasetId);assert.ok(csv.text.startsWith('\ufeff'));assert.match(csv.text,/"3"/);
  const json=JSON.parse(renderNotesExport([note],'json',config.datasetId).text);assert.equal(json.datasetId,config.datasetId);assert.equal(json.notes[0].id,note.id);assert.equal(json.notes[0].visibility,'private');
});
test('exports refuse more than 20,000 rows instead of silently truncating',()=>{
  assert.throws(()=>renderNotesExport(Array(20001).fill(note),'json',config.datasetId),/20,000/);
  assert.throws(()=>renderNotesExport([note],'html',config.datasetId),/지원하지/);
});

const sql = await readFile(new URL('../supabase/tests/fixtures/notes.sql',import.meta.url),'utf8');
test('SQL has no direct anonymous/authenticated table grants and isolates project tables',()=>{
  assert.match(sql,/revoke all on table public\.paper_review_datasets, public\.paper_review_notes from public, anon, authenticated/);
  assert.equal((sql.match(/enable row level security/g)||[]).length,2);
  assert.doesNotMatch(sql,/grant\s+(?:all|select|insert|update|delete)[^;]*to\s+(?:anon|authenticated)/i);
  assert.match(sql,/references public\.paper_review_datasets\(id\)/);
});
test('every SECURITY DEFINER function fixes search_path and restricts execute grants',()=>{
  const functions=[...sql.matchAll(/create or replace function public\.(paper_review_\w+)([\s\S]*?)\$\$;/g)];
  assert.equal(functions.length,6);
  for(const [,name,body]of functions){assert.match(body,/security definer set search_path = ''/);assert.ok(sql.includes(`revoke all on function public.${name}(`));}
  assert.match(sql,/grant execute on function public\.paper_review_list_notes\(text,text,boolean\) to anon, authenticated/);
  for(const name of ['create_note','update_note','delete_note'])assert.match(sql,new RegExp(`revoke all on function public\\.paper_review_${name}\\([^;]+from public, anon`));
});
test('notes default private, mutation ownership/revision are atomic and owner ID is not serialized',()=>{
  assert.match(sql,/visibility text not null default 'private'/);
  assert.match(sql,/coalesce\(p_input->>'visibility','private'\)/);
  assert.equal((sql.match(/n\.owner_id = v_owner and n\.revision =/g)||[]).length,2);
  const serializer=sql.slice(sql.indexOf('function public.paper_review_public_note'),sql.indexOf('revoke all on function public.paper_review_public_note'));
  assert.doesNotMatch(serializer,/'(?:ownerId|owner_id|userId)'/);
  assert.match(serializer,/'editable',coalesce\(p_row\.owner_id = auth\.uid\(\),false\)/);
});
test('SQL checks server-side bounds, dataset footnote/page and export limit',()=>{
  for(const pattern of [/octet_length\(p_input::text\) > 64000/,/char_length\(p_input->>'text'\) not between 1 and 10000/,/char_length\(p_input->>'quote'\) > 4000/,/v_dataset\.footnote_count/,/v_dataset\.page_count/,/limit v_limit \+ 1/,/raise sqlstate 'PT413'/])assert.match(sql,pattern);
});
// Adapter checks and static checks on the existing RPC test fixture only.
// These functions are reused on the shared project, not applied as a new migration.
