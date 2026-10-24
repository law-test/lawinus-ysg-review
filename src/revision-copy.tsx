import {useEffect,useId,useRef,useState} from 'react';
import './revision-copy.css';
export function RevisionComparison({before,after,reason}:{before:string;after?:string;reason?:string}){
 return <section className="revision-comparison" aria-label="Before·After·상세이유 비교">
  <div className="revision-comparison-part"><h3 className="revision-section-heading">Before<RevisionCopyButton text={before} label="Before 복사"/></h3><div className="revision-comparison-text">{before}</div></div>
  <hr/>
  <div className="revision-comparison-part"><h3 className="revision-section-heading">After{after!==undefined&&<RevisionCopyButton text={after} label="After 복사"/>}</h3><div className="revision-comparison-text">{after??'등록된 수정안이 없습니다.'}</div></div>
  <hr/>
  <div className="revision-comparison-part"><h3>상세이유</h3><div className="revision-comparison-text">{reason??'등록된 상세이유가 없습니다.'}</div></div>
 </section>;
}

export async function copyRevisionText(text:string,clipboard:Pick<Clipboard,'writeText'>|undefined):Promise<void>{
 if(!clipboard)throw new Error('clipboard-unavailable');
 await clipboard.writeText(text);
}

export function RevisionCopyButton({text,label}:{text:string;label:'Before 복사'|'After 복사'|'입력한 After 복사'}){
 const [status,setStatus]=useState<'idle'|'busy'|'copied'|'failed'>('idle');
 const fallback=useRef<HTMLTextAreaElement>(null),generation=useRef(0),id=useId();
 useEffect(()=>{generation.current++;setStatus('idle');return()=>{generation.current++;};},[text]);
 useEffect(()=>{if(status==='failed'){fallback.current?.focus();fallback.current?.select();}},[status]);
 async function copy(){
  const request=++generation.current;setStatus('busy');
  try{
   await copyRevisionText(text,typeof navigator==='undefined'?undefined:navigator.clipboard);
   if(request===generation.current)setStatus('copied');
  }catch{if(request===generation.current)setStatus('failed');}
 }
 return <span className="revision-copy-control">
  <button type="button" title={label==='After 복사'?'최신 수정지시서의 After 복사':label} disabled={status==='busy'} onClick={()=>void copy()} aria-describedby={status==='failed'?id:undefined}>{label}</button>
  {status==='copied'&&<span className="revision-copy-status" role="status">복사했습니다.</span>}
  {status==='failed'&&<span className="revision-copy-fallback"><span id={id} role="alert">아래 문안을 선택해 복사해 주세요.</span><textarea ref={fallback} readOnly aria-label={`${label}할 문안`} value={text} rows={4}/></span>}
 </span>;
}
