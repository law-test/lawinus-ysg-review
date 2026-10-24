import React,{useEffect,useRef} from 'react';
import './memo-dialog.css';

type Draft=Record<string,any>;
type Props={draft:Draft;saving:boolean;sessionReady:boolean;sessionConnecting:boolean;error:string;onChange:(draft:Draft)=>void;onClose:()=>void;onSave:()=>void;onDelete:()=>void;onReconnect:()=>void};

export function memoInputScrollTop(scrollTop:number,bodyTop:number,bodyHeight:number,inputTop:number,inputHeight:number){
  if(bodyHeight<=0)return scrollTop;
  const top=inputTop-bodyTop,bottom=top+inputHeight;
  if(top<0)return Math.max(0,scrollTop+top);
  if(bottom>bodyHeight)return Math.max(0,scrollTop+Math.min(top,bottom-bodyHeight));
  return scrollTop;
}

export default function MemoDialog({draft,saving,sessionReady,sessionConnecting,error,onChange,onClose,onSave,onDelete,onReconnect}:Props){
  const dialog=useRef<HTMLElement>(null),body=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
  const opener=useRef(typeof document==='undefined'?null:document.activeElement as HTMLElement|null);
  const current=useRef({saving,onClose});current.current={saving,onClose};
  const revealInput=()=>{
    if(!body.current||!input.current||document.activeElement!==input.current)return;
    const box=body.current.getBoundingClientRect(),field=input.current.getBoundingClientRect();
    body.current.scrollTop=memoInputScrollTop(body.current.scrollTop,box.top,body.current.clientHeight,field.top,field.height);
  };
  useEffect(()=>{
    input.current?.focus({preventScroll:true});
    let frame=0;const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(revealInput);};schedule();
    const viewport=window.visualViewport;
    viewport?.addEventListener('resize',schedule);window.addEventListener('resize',schedule);
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();if(!current.current.saving)current.current.onClose();return;}
      if(event.key!=='Tab')return;
      const items=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled),input:not(:disabled),a[href]')||[]);
      const first=items[0],last=items[items.length-1];
      if(!first){event.preventDefault();dialog.current?.focus({preventScroll:true});}
      else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus({preventScroll:true});}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus({preventScroll:true});}
    };
    document.addEventListener('keydown',onKey);
    return()=>{document.removeEventListener('keydown',onKey);viewport?.removeEventListener('resize',schedule);window.removeEventListener('resize',schedule);cancelAnimationFrame(frame);if(opener.current?.isConnected)opener.current.focus({preventScroll:true});};
  },[]);
  const editable=!draft.id||draft.editable;
  const close=()=>{if(!saving)onClose();};
  return <div className="modal-backdrop memo-dialog-backdrop" onClick={event=>{if(event.target===event.currentTarget)close();}}>
    <section ref={dialog} className="memo-modal memo-dialog" role="dialog" aria-modal="true" aria-labelledby="memo-title" tabIndex={-1}>
      <div className="modal-heading"><h2 id="memo-title">{draft.id?'검토 메모':'메모 붙이기'}</h2><button disabled={saving} onClick={close} aria-label="닫기">×</button></div>
      <div ref={body} className="memo-dialog-body">
        <p className="small-note">{draft.noteId?`각주 ${Number(draft.noteId.slice(3))}`:draft.anchorType==='source'?'참고자료':draft.anchorType==='general'?'전체 의견':'논문 원문'}{draft.page?` · PDF ${draft.page}쪽`:''}</p>
        {draft.quote&&<blockquote>{draft.quote}</blockquote>}
        {!sessionReady&&<div className="memo-error" role="status">{sessionConnecting?'메모 저장을 준비하고 있습니다.':'메모 저장 전에 이용 정보를 연결해 주세요.'}{!sessionConnecting&&<button onClick={onReconnect}>다시 연결</button>}</div>}
        {error&&<div className="memo-error" role="alert">{error}</div>}
        <textarea ref={input} disabled={saving} aria-label="검토 메모 내용" maxLength={10000} rows={8} placeholder="수정 제안, 확인할 근거, 심사 의견을 적어 주세요." value={draft.text} readOnly={!editable} onFocus={revealInput} onChange={event=>onChange({...draft,text:event.target.value})}/>
        <div className="memo-options"><label><input type="checkbox" checked={draft.visibility==='shared'} disabled={saving||!editable} onChange={event=>onChange({...draft,visibility:event.target.checked?'shared':'private'})}/> 링크 방문자에게 공유</label><label><input type="checkbox" checked={draft.status==='resolved'} disabled={saving||!editable} onChange={event=>onChange({...draft,status:event.target.checked?'resolved':'open'})}/> 해결됨</label></div>
        <p className="small-note">공유 메모는 링크를 연 누구나 볼 수 있습니다. 개인 메모는 이 브라우저에 연결됩니다. 사이트 저장 데이터를 삭제하면 다시 접근할 수 없습니다.</p>
      </div>
      <div className="modal-actions">{draft.id&&draft.editable&&<button disabled={saving} className="danger" onClick={onDelete}>삭제</button>}<div className="toolbar-spacer"/><button disabled={saving} onClick={close}>닫기</button>{editable&&<button className="primary" disabled={!sessionReady||saving||!draft.text.trim()} onClick={onSave}>{!sessionReady?(sessionConnecting?'준비 중…':'연결 필요'):saving?'저장 중…':'메모 저장'}</button>}</div>
    </section>
  </div>;
}
