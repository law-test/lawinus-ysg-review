const base='https://cefaekvclooytgjkcqum.supabase.co/functions/v1/';
const storageKey='ysg-reader-session';
export type Session={token:string;expiresAt:string|number};
declare global {interface Window {__paperReaderSession?:Session|null}}
export type Toc={title:string;page:number;level:number};
export type Source={id:string;title:string;kind?:string;pageCount?:number;format?:'text'|'pages'};
export type Catalog={title:string;subtitle?:string;author?:string;pageCount:number;bodyStartPage:number;searchEnabled?:boolean;toc:Toc[];sources:Source[]};
export type Citation={id:string;page?:number;label?:string;excerpt?:string;verified?:boolean;image?:boolean;previewPages?:number[];highlights?:{x:number;y:number;w:number;h:number}[]};
export type Note={number:number;page:number;text:string;sources:Citation[];markers?:{x:number;y:number;w:number;h:number}[]};
export function expiration(value:string|number){
  return typeof value==='number'?(value<1e12?value*1000:value):new Date(value).getTime();
}
export function readSession():Session|null{
  const memory=window.__paperReaderSession;
  if(memory&&expiration(memory.expiresAt)>Date.now()+30000)return memory;
  try{const s=JSON.parse(sessionStorage.getItem(storageKey)||'null');return s&&s.mode==='public-visit'&&/^[a-f0-9]{64}$/i.test(s.token)&&expiration(s.expiresAt)>Date.now()+30000?s:null;}
  catch{return null;}
}
export function storeSession(s:Session|null){
  window.__paperReaderSession=s;
  try{if(s)sessionStorage.setItem(storageKey,JSON.stringify({...s,mode:'public-visit'}));else sessionStorage.removeItem(storageKey);}catch{}
}
export class ReaderError extends Error{
  status:number;wait:number;
  constructor(status:number,wait:number){
    super(status===429?'열람 요청이 많습니다. 잠시 후 다시 시도해 주세요.':'열람 자료를 불러오지 못했습니다.');
    this.status=status;this.wait=wait;
  }
}
export function automaticRetryMessage(error:ReaderError){
  return '열람 요청이 잠시 제한됐습니다. '+error.wait+'초 후 자동으로 다시 연결합니다.';
}
const nextRequestAt={page:0,visit:0};
function waitSeconds(header:string|null){
  if(!header)return 60;
  const seconds=/^\d+$/.test(header)?Number(header):(Date.parse(header)-Date.now())/1000;
  return Number.isFinite(seconds)&&seconds>0?Math.ceil(seconds):60;
}
async function checked(name:string,options:RequestInit,reviewer=false){
  const group=reviewer?'page':'visit';
  const remaining=Math.ceil((nextRequestAt[group]-Date.now())/1000);
  if(remaining>0)throw new ReaderError(429,remaining);
  const controller=new AbortController();let timedOut=false;
  const abort=()=>controller.abort();
  if(options.signal?.aborted)controller.abort();else options.signal?.addEventListener('abort',abort,{once:true});
  const timer=window.setTimeout(()=>{timedOut=true;controller.abort();},25000);
  try{
  const response=await fetch(base+name,{...options,signal:controller.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
  if(!response.ok){
    if(reviewer&&(response.status===401||response.status===403))window.dispatchEvent(new Event('paper:expired'));
    if(response.status===429){
      const seconds=waitSeconds(response.headers.get('Retry-After'));
      nextRequestAt[group]=Math.max(nextRequestAt[group],Date.now()+seconds*1000);
      throw new ReaderError(429,Math.ceil((nextRequestAt[group]-Date.now())/1000));
    }
    throw new ReaderError(response.status,12);
  }
  // Keep the deadline through body download as mobile connections can stall
  // after headers. The reader already consumes each response in full.
  const body=await response.arrayBuffer();
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  }catch(error){
    if(timedOut)throw new Error('연결이 지연되고 있습니다. 다시 시도해 주세요.');
    throw error;
  }finally{window.clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
let memoryKey='';
function browserKey(){
  try{const saved=localStorage.getItem('ysg-reading-browser');if(saved&&/^[a-f0-9]{64}$/i.test(saved))return saved;}catch{}
  if(!memoryKey)memoryKey=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  try{localStorage.setItem('ysg-reading-browser',memoryKey);}catch{}
  return memoryKey;
}
export async function visit():Promise<Session>{
  const response=await checked('ysg-visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({browserKey:browserKey()})});
  const result=await response.json();
  if(!/^[a-f0-9]{64}$/i.test(result.token)||!(expiration(result.expiresAt)>Date.now()))throw Error('열람 연결을 시작하지 못했습니다.');
  return {token:result.token,expiresAt:result.expiresAt};
}
export function privateResource(session:Session,query:URLSearchParams,signal:AbortSignal){
  query.set('edition','ysg-20261121');
  return checked('ysg-page?'+query.toString(),{signal,headers:{Authorization:'Bearer '+session.token}},true);
}
