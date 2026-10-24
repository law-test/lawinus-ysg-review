import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {validateReviewConfig} from '../src/review-api.ts';

const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
export function validateBundle(bundle){
 const keys=new Set(),catalog=new Map(),heads=new Map(),ids=new Set();
 for(const row of bundle.targets){
  const key=`${row.kind}:${row.targetId}`;
  if(keys.has(key)||sha(row.originalText)!==row.originalSha256)throw new Error('원문 목록이 중복되거나 해시가 다릅니다.');
  keys.add(key);catalog.set(key,row);
 }
 for(const row of bundle.revisions){
  const key=`${row.kind}:${row.targetId}`;const previous=heads.get(key);
  if(!catalog.has(key)||ids.has(row.id)||row.datasetId!==bundle.datasetId||BigInt(row.id)>BigInt(bundle.snapshotId)
   ||row.revision!==(previous?.revision||0)+1||row.parentRevision!==row.revision-1||sha(row.text)!==row.textSha256)
   throw new Error('수정 이력의 연결·해시·기준본·기준 시점을 확인할 수 없습니다.');
  ids.add(row.id);heads.set(key,row);
 }
 return [...heads.entries()].map(([key,edit])=>({...catalog.get(key),current:edit}))
  .sort((a,b)=>(a.page??10001)-(b.page??10001)||a.kind.localeCompare(b.kind)||a.targetId.localeCompare(b.targetId));
}

export async function collect(client,datasetId){
 async function rpc(name,args){const {data,error}=await client.rpc(`paper_review_shared_${name}`,{p_dataset_id:datasetId,...args});if(error)throw new Error(`${name}: ${error.code||'request_failed'} ${error.message}`);if(!data)throw new Error(`${name}: empty response`);return data;}
 const targets=[];let offset=0,totalTargets;
 for(;;){const p=await rpc('catalog',{p_offset:offset,p_limit:500});totalTargets??=p.totalCount;
  if(p.totalCount!==totalTargets)throw new Error('원문 목록이 변경되었습니다. 다시 실행해 주세요.');
  targets.push(...p.targets);if(!p.hasMore)break;if(p.nextOffset<=offset)throw new Error('원문 목록 커서가 진행되지 않습니다.');offset=p.nextOffset;
 }
 if(targets.length!==totalTargets)throw new Error('원문 목록 일부가 누락되었습니다.');
 const revisions=[];let after='0',snapshot=null,total;
 for(;;){const p=await rpc('export',{p_after_id:after,p_through_id:snapshot,p_limit:200});snapshot??=p.snapshotId;total??=p.totalCount;
  if(snapshot!==p.snapshotId||total!==p.totalCount)throw new Error('수정 이력의 기준 시점이 변경되었습니다.');
  revisions.push(...p.revisions);if(!p.hasMore)break;if(BigInt(p.nextAfterId)<=BigInt(after))throw new Error('수정 이력 커서가 진행되지 않습니다.');after=p.nextAfterId;
 }
 if(revisions.length!==total)throw new Error('수정 이력 일부가 누락되었습니다.');
 const result={schemaVersion:1,datasetId,exportedAt:new Date().toISOString(),snapshotId:snapshot,targets,revisions};
 result.currentChanges=validateBundle(result);return result;
}

function reviewText(bundle){
 return bundle.currentChanges.map(row=>{
  const loc=`PDF ${row.page??'미확정'}쪽${row.printedPage?` / 본문 ${row.printedPage}면`:''} · ${row.kind==='footnote'?'각주':'본문'} ${row.targetId} · 수정 ${row.current.revision}`;
  return `Before (${loc})\n\n${row.originalText}\n\nAfter\n\n${row.current.text||'(빈 내용)'}\n\n상세이유\n\n${row.current.reason||'(방문자가 수정 이유를 남기지 않음)'}\n`;
 }).join('\n---\n\n');
}

async function main(){
 const root=fileURLToPath(new URL('../',import.meta.url));
 const config=validateReviewConfig(JSON.parse(await readFile(path.join(root,'public/config.json'),'utf8')));
 if(config.datasetId!=='ysg-20261023'||config.storageBucket!=='ysg-review-documents')throw new Error('YSG 자료 묶음과 저장소 설정을 확인해 주세요.');
 const client=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const bundle=await collect(client,config.datasetId);
 const stamp=new Date().toISOString().replaceAll(':','-');
 const destination=path.resolve(process.argv[2]||path.join(root,'work',`ysg-shared-edits-export-${stamp}`));
 await mkdir(destination,{recursive:true});
 await writeFile(path.join(destination,'all-revisions.json'),JSON.stringify(bundle,null,2)+'\n',{encoding:'utf8',flag:'wx'});
 await writeFile(path.join(destination,'page-ordered-current-changes.md'),reviewText(bundle),{encoding:'utf8',flag:'wx'});
 console.log(JSON.stringify({datasetId:bundle.datasetId,snapshotId:bundle.snapshotId,targets:bundle.targets.length,revisions:bundle.revisions.length,currentChanges:bundle.currentChanges.length,destination}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
