import React,{useEffect,useRef,useState} from 'react';
import {requestedPdfPage,steppedPdfZoom} from './pdf-quick-tools-model';
import './pdf-quick-controls.css';

type Props={id:string;label:string;page:number;total:number;zoom:number;hand:boolean;onPageChange:(page:number)=>void;onZoomChange?:(zoom:number)=>void;onHandChange:(hand:boolean)=>void;showHighlights?:boolean;onHighlightsChange?:(show:boolean)=>void};

export default function PdfQuickControls({id,label,page,total,zoom,hand,onPageChange,onZoomChange,onHandChange,showHighlights=true,onHighlightsChange}:Props){
  const [open,setOpen]=useState(false),[draft,setDraft]=useState(String(page));
  const host=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),editing=useRef(false);
  const panelId='pdf-quick-'+id;
  const close=()=>{setOpen(false);editing.current=false;setDraft(String(page));trigger.current?.focus({preventScroll:true});};
  useEffect(()=>{
    const button=trigger.current,container=host.current;if(!button||!container)return;
    const measure=()=>container.style.setProperty('--pdf-quick-trigger-height',`${Math.ceil(button.getBoundingClientRect().height)}px`);
    measure();const observer=new ResizeObserver(measure);observer.observe(button);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{if(!editing.current)setDraft(String(page));},[page]);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!host.current?.contains(event.target as Node)){setOpen(false);editing.current=false;setDraft(String(page));}};
    window.addEventListener('pointerdown',outside);
    return()=>window.removeEventListener('pointerdown',outside);
  },[open,page]);
  function navigate(event:React.FormEvent){
    event.preventDefault();
    const next=requestedPdfPage(draft,total);
    if(next===null){setDraft(String(page));return;}
    setDraft(String(next));editing.current=false;onPageChange(next);
  }
  return <div className="pdf-quick-controls" ref={host} onKeyDown={event=>{if(open&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}}}>
    <button ref={trigger} className="pdf-quick-trigger" aria-expanded={open} aria-controls={panelId} aria-label={label+' 쪽 이동과 확대 도구'} onClick={()=>{if(open)close();else{setDraft(String(page));setOpen(true);}}}><span className="pdf-quick-label-full">{label} 도구</span><span className="pdf-quick-label-short" aria-hidden="true">도구</span><span aria-hidden="true">{open?'⌄':'⌃'}</span></button>
    {open&&<div className="pdf-quick-panel" id={panelId} role="dialog" aria-label={label+' 보기 도구'}>
      <div className="pdf-quick-heading"><b>{label} 보기</b><button aria-label={label+' 도구 접기'} onClick={close}>접기</button></div>
      <form className="pdf-quick-page" onSubmit={navigate}>
        <label htmlFor={panelId+'-page'}>PDF 쪽</label><div className="pdf-quick-page-entry"><input id={panelId+'-page'} type="number" inputMode="numeric" min={1} max={total} step={1} value={draft} aria-label={label+' 이동할 PDF 쪽'} onFocus={()=>{editing.current=true;}} onChange={event=>{editing.current=true;setDraft(event.target.value);}} onBlur={()=>{editing.current=false;}}/><span>/ {total}</span><button type="submit">이동</button></div>
      </form>
      <div className="pdf-quick-page-step"><button disabled={page<=1} aria-label={label+' 이전 쪽'} onClick={()=>onPageChange(page-1)}>‹ 이전</button><button disabled={page>=total} aria-label={label+' 다음 쪽'} onClick={()=>onPageChange(page+1)}>다음 ›</button></div>
      {onZoomChange&&<div className="pdf-quick-zoom" aria-label={label+' 확대율'}><button disabled={zoom<=.7} aria-label={label+' 축소'} onClick={()=>onZoomChange(steppedPdfZoom(zoom,-1))}>−</button><button aria-label={label+' 너비에 맞추기'} title="너비에 맞추기" onClick={()=>onZoomChange(1)}>{Math.round(zoom*100)}%</button><button disabled={zoom>=2} aria-label={label+' 확대'} onClick={()=>onZoomChange(steppedPdfZoom(zoom,1))}>＋</button></div>}
      <div className="pdf-quick-interaction"><button aria-pressed={hand} onClick={()=>onHandChange(true)}>손으로 이동</button><button aria-pressed={!hand} onClick={()=>onHandChange(false)}>글자 선택</button></div>
      {onHighlightsChange&&<button className="pdf-quick-highlight" aria-pressed={showHighlights} onClick={()=>onHighlightsChange(!showHighlights)}>{showHighlights?'강조 숨기기':'강조 보기'}</button>}
    </div>}
  </div>;
}
