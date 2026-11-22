import {privateResource,type Session} from './reader-api';

type Entry<T>={controller:AbortController;promise:Promise<T>;users:number;finished:boolean;size:number};
export function pageCache<T>(limit:number,byteLimit:number,decode:(r:Response)=>Promise<T>,sizeOf:(v:T)=>number){
  let token='';const entries=new Map<string,Entry<T>>();
  function prune(){
    let bytes=0;for(const entry of entries.values())bytes+=entry.size;
    for(const [key,entry] of entries){
      if(entries.size<=limit&&bytes<=byteLimit)break;
      if(entry.users||!entry.finished)continue;
      entries.delete(key);bytes-=entry.size;
    }
  }
  return function acquire(session:Session,query:string){
    if(token!==session.token){for(const v of entries.values())v.controller.abort();entries.clear();token=session.token;}
    let entry=entries.get(query);
    if(entry){entries.delete(query);entries.set(query,entry);}
    else{
      const controller=new AbortController();
      const promise=privateResource(session,new URLSearchParams(query),controller.signal).then(decode);
      entry={controller,promise,users:0,finished:false,size:0};entries.set(query,entry);
      const active=entry;
      promise.then(v=>{active.finished=true;active.size=sizeOf(v);prune();},()=>{active.finished=true;if(entries.get(query)===active)entries.delete(query);});
    }
    entry.users++;
    const owned=entry;const release=()=>{
      owned.users--;
      if(!owned.users&&!owned.finished){owned.controller.abort();if(entries.get(query)===owned)entries.delete(query);}
      prune();
    };
    return {promise:entry.promise,release};
  };
}
export const getPageImage=pageCache(12,10*1024*1024,async r=>{
  if(!r.headers.get('Content-Type')?.startsWith('image/'))throw Error('열람 이미지를 확인하지 못했습니다.');
  return r.blob();
},blob=>blob.size);
