import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {validateBundle,collect} from '../scripts/export-shared-edits.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const target={kind:'footnote',targetId:'fn-001',originalText:'original',originalSha256:hash('original'),page:5};
const revision=n=>({id:String(n),datasetId:'d',kind:'footnote',targetId:'fn-001',revision:n,parentRevision:n-1,text:`edit${n}`,textSha256:hash(`edit${n}`)});
test('export detects omitted intermediate revisions and changed original text',()=>{
 const b={datasetId:'d',snapshotId:'3',targets:[target],revisions:[revision(1),revision(2),revision(3)]};
 assert.equal(validateBundle(b)[0].current.revision,3);
 assert.throws(()=>validateBundle({...b,revisions:[revision(1),revision(3)]}),/연결/);
 assert.throws(()=>validateBundle({...b,targets:[{...target,originalText:'changed'}]}),/해시/);
 assert.throws(()=>validateBundle({...b,snapshotId:'2'}),/기준 시점/);
});
test('all export pages reuse first snapshot and no artificial revision cap',async()=>{
 const revisions=Array.from({length:205},(_,i)=>revision(i+1));const calls=[];
 const client={rpc:async(name,args)=>{calls.push({name,args});if(name.endsWith('catalog'))return{data:{targets:[target],totalCount:1,hasMore:false,nextOffset:1}};
  const after=Number(args.p_after_id),rows=revisions.slice(after,after+200);
  return{data:{snapshotId:'205',totalCount:205,revisions:rows,hasMore:after+200<205,nextAfterId:rows.at(-1).id}};
 }};
 const b=await collect(client,'d');assert.equal(b.revisions.length,205);assert.equal(calls[2].args.p_through_id,'205');
 assert.equal(b.currentChanges[0].current.revision,205);
});
