import React,{useEffect,useRef,useState} from 'react';
import {type ReadingView,type ReadingPane,readingVisibility,withReadingFocus,withReadingSurface} from './reading-view';
import {menuSwipeAction,type MenuSwipe} from './mobile-menu-swipe';

type Props={view:ReadingView;onChange:(view:ReadingView)=>void;sidebar:boolean;metadata:boolean;onSidebar:(show:boolean)=>void;onMetadata:(show:boolean)=>void;document:'thesis'|'source';onDocument:(document:'thesis'|'source')=>void;onEqualWidth:()=>void;mobile?:boolean;pane?:ReadingPane};

export default function ReadingControls({view,onChange,sidebar,metadata,onSidebar,onMetadata,document:currentDocument,onDocument,onEqualWidth,mobile=false,pane=currentDocument}:Props){
  const [open,setOpen]=useState(false);
  const menu=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const swipe=useRef<MenuSwipe|null>(null),swipeMoved=useRef(false),suppressClick=useRef(false);
  function startSwipe(event:React.PointerEvent<HTMLButtonElement>){
    if(!mobile)return;
    if(!event.isPrimary){swipe.current=null;swipeMoved.current=false;suppressClick.current=true;return;}
    suppressClick.current=false;swipeMoved.current=false;swipe.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,time:event.timeStamp};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveSwipe(event:React.PointerEvent<HTMLButtonElement>){const start=swipe.current;if(start?.pointerId===event.pointerId&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>8)swipeMoved.current=true;}
  function endSwipe(event:React.PointerEvent<HTMLButtonElement>){
    const start=swipe.current;if(!start||start.pointerId!==event.pointerId)return;
    swipe.current=null;const action=menuSwipeAction(start,{x:event.clientX,y:event.clientY,time:event.timeStamp});
    suppressClick.current=swipeMoved.current||!!action;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(action){onChange(withReadingFocus(view,action==='collapse'));setOpen(false);}
  }
  function cancelSwipe(){swipe.current=null;swipeMoved.current=false;suppressClick.current=true;}
  const close=()=>{setOpen(false);trigger.current?.focus({preventScroll:true});};
  useEffect(()=>{const controls=menu.current?.querySelector<HTMLElement>('.reading-view-actions'),app=menu.current?.closest<HTMLElement>('.review-app');if(!controls||!app)return;const measure=()=>{const bounds=controls.getBoundingClientRect();app.style.setProperty('--reading-actions-clearance',`${Math.ceil(bounds.width)+20}px`);app.style.setProperty('--reading-actions-height',`${Math.ceil(bounds.height)}px`);};measure();const observer=new ResizeObserver(measure);observer.observe(controls);return()=>{observer.disconnect();app.style.removeProperty('--reading-actions-clearance');app.style.removeProperty('--reading-actions-height');};},[]);
  useEffect(()=>{if(!open)return;const pointer=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node))setOpen(false);};const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close();}};window.addEventListener('pointerdown',pointer);window.addEventListener('keydown',key);return()=>{window.removeEventListener('pointerdown',pointer);window.removeEventListener('keydown',key);};},[open]);
  const visible=readingVisibility(view,sidebar,metadata);
  const choices:[string,boolean,(show:boolean)=>void][]=[
    ['상단 메뉴',visible.header,show=>onChange(withReadingSurface(view,'header',show))],
    ['보기 도구',visible.tools,show=>onChange(withReadingSurface(view,'tools',show))],
    ['하단 각주 목록',visible.footnotes,show=>onChange(withReadingSurface(view,'footnotes',show))],
    ['목차',mobile?pane==='contents':visible.sidebar,onSidebar],
    ['각주 상세정보',mobile?pane==='metadata':visible.metadata,onMetadata],
  ];
  return <div className="reading-view-menu" ref={menu}>
    {mobile&&<span id="mobile-swipe-hint" className="mobile-swipe-hint">접기 버튼을 위로 밀면 메뉴가 접히고, 아래로 밀면 펼쳐집니다.</span>}
    <div className="reading-view-actions">
      <button className="reading-collapse-toggle" data-mobile-swipe={mobile?"true":undefined} aria-describedby={mobile?"mobile-swipe-hint":undefined} onPointerDown={startSwipe} onPointerMove={moveSwipe} onPointerUp={endSwipe} onPointerCancel={cancelSwipe} aria-label={view.focus?'메뉴 펼치기':'메뉴 접기'} aria-expanded={!view.focus} aria-controls="workspace-header workspace-basis workspace-navigation reference-metadata" title={view.focus?'접기 전 메뉴와 도구로 돌아가기':'상단 메뉴와 도구를 접고 문서만 보기'} onClick={event=>{if(event?.detail&&suppressClick.current){suppressClick.current=false;event.preventDefault();return;}onChange(withReadingFocus(view,!view.focus));setOpen(false);}}><span aria-hidden="true">{view.focus?'⌄':'⌃'}</span><span className="reading-collapse-label">{view.focus?'메뉴 펼치기':'메뉴 접기'}</span><span className="reading-collapse-short" aria-hidden="true">{view.focus?'펼치기':'접기'}</span></button>
      <button className="reading-view-trigger" ref={trigger} aria-expanded={open} aria-controls="reading-view-options" onClick={()=>setOpen(!open)}>보기</button>
    </div>
    {open&&<div className="reading-view-options" id="reading-view-options" role="dialog" aria-label="화면 보기 설정">
      <button className="reading-focus-toggle" aria-pressed={view.focus} onClick={()=>{onChange(withReadingFocus(view,!view.focus));close();}}>{view.focus?'일반 보기로 돌아가기':'원문만 보기'}</button>
      <button className="reading-equal-width" onClick={()=>{onEqualWidth();close();}}>논문·원전 같은 폭</button>
      <fieldset className="reading-surface-options"><legend>화면에 표시</legend>{choices.map(([label,checked,change])=><label key={label}><input type="checkbox" checked={checked} onChange={event=>change(event.target.checked)}/>{label}</label>)}</fieldset>
      <div className="reading-document-switch" aria-label="열람할 문서">{[['thesis','논문'],['source','참고문헌']].map(([id,label])=><button key={id} aria-pressed={(mobile?pane:currentDocument)===id} onClick={()=>{onDocument(id as 'thesis'|'source');close();}}>{label}</button>)}</div>
    </div>}
  </div>;
}
