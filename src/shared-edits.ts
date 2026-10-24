import {getReviewConnection, initializeReviewSession} from './review-api';

export type SharedEditKind = 'paragraph'|'footnote';
export type SharedEdit = {
 id:string; datasetId:string; kind:SharedEditKind; targetId:string;
 revision:number; parentRevision:number; text:string; textSha256:string;
 reason:string; action:'edit'|'restore'; restoredFromRevision:number|null;
 displayName:string; createdAt:string;
};
export type SharedOriginal = {
 datasetId:string; kind:SharedEditKind; targetId:string; revision:0;
 text:string; textSha256:string; page:number|null; printedPage:string|null; label:string;
};
export type SharedHistory = {
 original:SharedOriginal; currentRevision:number; revisions:SharedEdit[];
 hasMore:boolean; nextBeforeRevision:number|null;
};
export type SharedCatalogTarget = {
 kind:SharedEditKind; targetId:string; originalText:string; originalSha256:string;
 page:number|null; printedPage:string|null; label:string;
};
export class SharedEditError extends Error {
 constructor(message:string,public readonly code:string){super(message);this.name='SharedEditError';}
}

async function sharedRpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
 const {config,client}=await getReviewConnection();
 const {data,error}=await client.rpc(`paper_review_shared_${name}`,{p_dataset_id:config.datasetId,...args});
 if(error){
  const code=error.code||'CONNECTION_ERROR';
  const messages:Record<string,string>={
   PT409:'다른 방문자가 먼저 수정했습니다. 최신 내용을 확인한 뒤 다시 저장해 주세요.',
   PT404:'편집할 원문 또는 수정 이력을 찾지 못했습니다.',
   PT401:'편집 이용 정보를 다시 연결한 뒤 저장해 주세요.',
   '42501':'공통 편집 권한을 확인하지 못했습니다. 다시 연결한 뒤 저장해 주세요.',
  };
  throw new SharedEditError(messages[code]||(/^PT(400|429)$/.test(code)?error.message:'공통 수정 내용을 저장하거나 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'),code);
 }
 if(!data||typeof data!=='object')throw new SharedEditError('공통 편집 결과를 확인하지 못했습니다. 최신 내용을 다시 불러와 주세요.','INVALID_RESPONSE');
 return data as T;
}

export function loadSharedEdits():Promise<{datasetId:string;overrides:SharedEdit[];snapshotId:string}>{
 return sharedRpc('list',{});
}
export function getSharedEditHistory(kind:SharedEditKind,targetId:string,beforeRevision:number|null=null,limit=50):Promise<SharedHistory>{
 return sharedRpc('history',{p_kind:kind,p_target_id:targetId,p_before_revision:beforeRevision,p_limit:limit});
}
export async function saveSharedEdit(input:{kind:SharedEditKind;targetId:string;text:string;expectedRevision:number;reason?:string}):Promise<SharedEdit>{
 if(Array.from(input.text).length>100000||Array.from(input.reason||'').length>2000)throw new SharedEditError('수정 내용은 100,000자, 수정 이유는 2,000자 이내로 입력해 주세요.','PT400');
 await initializeReviewSession();
 return (await sharedRpc<{edit:SharedEdit}>('save',{p_kind:input.kind,p_target_id:input.targetId,
  p_expected_revision:input.expectedRevision,p_text:input.text,p_reason:input.reason||'',p_restore_revision:null})).edit;
}
export async function restoreSharedEdit(input:{kind:SharedEditKind;targetId:string;restoreRevision:number;expectedRevision:number;reason?:string}):Promise<SharedEdit>{
 await initializeReviewSession();
 return (await sharedRpc<{edit:SharedEdit}>('save',{p_kind:input.kind,p_target_id:input.targetId,
  p_expected_revision:input.expectedRevision,p_text:null,p_reason:input.reason||'',p_restore_revision:input.restoreRevision})).edit;
}

// Complete history, fixed at the first page's committed snapshot. No silent cap.
export async function collectSharedEditsExport(){
 const {config}=await getReviewConnection();const targets:SharedCatalogTarget[]=[];
 let offset=0;let catalogTotal:number|undefined;
 for(;;){
  const p=await sharedRpc<{targets:SharedCatalogTarget[];totalCount:number;hasMore:boolean;nextOffset:number}>('catalog',{p_offset:offset,p_limit:500});
  catalogTotal??=p.totalCount;
  if(p.totalCount!==catalogTotal)throw new Error('원문 목록이 바뀌었습니다. 다시 내보내 주세요.');
  targets.push(...p.targets);if(!p.hasMore)break;
  if(p.nextOffset<=offset)throw new Error('원문 목록을 끝까지 수집하지 못했습니다.');offset=p.nextOffset;
 }
 if(targets.length!==catalogTotal)throw new Error('원문 목록 일부를 수집하지 못했습니다.');
 const revisions:SharedEdit[]=[];let after='0';let snapshot:string|null=null;let total:number|undefined;
 for(;;){
  const p:{snapshotId:string;totalCount:number;revisions:SharedEdit[];hasMore:boolean;nextAfterId:string}=await sharedRpc('export',{p_after_id:after,p_through_id:snapshot,p_limit:200});
  snapshot??=p.snapshotId;total??=p.totalCount;
  if(snapshot!==p.snapshotId||total!==p.totalCount)throw new Error('수정 이력의 기준 시점이 바뀌었습니다. 다시 내보내 주세요.');
  revisions.push(...p.revisions);if(!p.hasMore)break;
  if(BigInt(p.nextAfterId)<=BigInt(after))throw new Error('수정 이력을 끝까지 수집하지 못했습니다.');after=p.nextAfterId;
 }
 if(revisions.length!==total||new Set(revisions.map(r=>r.id)).size!==revisions.length)throw new Error('수정 이력에 누락 또는 중복이 있습니다.');
 return {schemaVersion:1,datasetId:config.datasetId,exportedAt:new Date().toISOString(),snapshotId:snapshot,targets,revisions};
}
export async function downloadSharedEditsExport():Promise<void>{
 const bundle=await collectSharedEditsExport();const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=`공통수정이력_${bundle.datasetId}_${new Date().toISOString().slice(0,10)}.json`;a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
