import React,{useLayoutEffect,useRef,useState} from 'react';

type Size={title:number;toolbar:number;controls:number};
type Layout={pane:HTMLElement;root:HTMLElement;nav:HTMLElement;bar:HTMLElement;title:HTMLElement|null;toolbar:HTMLElement|null;body:HTMLElement};
type Anchor={picture:HTMLElement;fraction:number};
type Drag={id:number;y:number;from:number;sizes:Size;anchor?:Anchor};
const key='paper:reference-tools:collapsed';
let saved=false;
function preference(){
  try{return sessionStorage.getItem(key)==='1';}catch{return saved;}
}
function originalSize(view:Layout):Size{
  const previous=view.pane.dataset.referenceChrome;
  view.pane.dataset.referenceChrome='open';
  const title=view.title;
  const sizes={
    title:title?title.getBoundingClientRect().height+(parseFloat(getComputedStyle(title).marginBottom)||0):0,
    toolbar:view.toolbar?.getBoundingClientRect().height||0,
    controls:view.body.getBoundingClientRect().height,
  };
  view.pane.dataset.referenceChrome=previous||'open';
  return sizes;
}
function readingAnchor(view:Layout):Anchor|undefined{
  const edge=view.bar.getBoundingClientRect().bottom+1;
  const pictures=Array.from(view.nav.parentElement!.querySelectorAll<HTMLElement>('.reference-page .source-image'));
  const picture=pictures.find(item=>item.getBoundingClientRect().bottom>edge)||pictures.at(-1);
  if(!picture)return;
  const rect=picture.getBoundingClientRect();
  if(rect.height)return {picture,fraction:(edge-rect.top)/rect.height};
}
function keepLine(view:Layout,anchor?:Anchor){
  if(!anchor||!anchor.picture.isConnected)return;
  const rect=anchor.picture.getBoundingClientRect();
  const difference=rect.top+rect.height*anchor.fraction-view.bar.getBoundingClientRect().bottom-1;
  if(Math.abs(difference)>.5)view.root.scrollTop+=difference;
}
function apply(view:Layout,visible:number,sizes:Size,anchor?:Anchor){
  const mode=visible<=0?'hidden':visible>=1?'open':'dragging';
  view.pane.dataset.referenceChrome=mode;
  for(const name of ['title','toolbar','controls'] as const){
    view.pane.style.setProperty('--ref-'+name,Math.max(0,sizes[name]*visible)+'px');
  }
  const title=view.title;
  const sticky=title&&getComputedStyle(title).position==='sticky'?title.getBoundingClientRect().height:0;
  const inset=parseFloat(getComputedStyle(view.root).paddingTop)||0;
  view.nav.style.setProperty('--ref-sticky-top',Math.max(0,sticky-inset)+'px');
  keepLine(view,anchor);
}
export default function ReferenceChrome(){
  const bar=useRef<HTMLDivElement>(null),layout=useRef<Layout|null>(null),drag=useRef<Drag|null>(null),frame=useRef(0);
  const [hidden,setHidden]=useState(preference);
  const collapsed=useRef(hidden);
  useLayoutEffect(()=>{
    const el=bar.current,nav=el?.closest<HTMLElement>('.reference-page-controls'),root=el?.closest<HTMLElement>('.source-dialog'),pane=el?.closest<HTMLElement>('.reference-pane'),body=nav?.querySelector<HTMLElement>('.reference-control-body');
    if(!el||!nav||!root||!pane||!body)return;
    const view={bar:el,nav,root,pane,body,title:root.querySelector<HTMLElement>(':scope > h2'),toolbar:pane.querySelector<HTMLElement>(':scope > .reference-toolbar')};
    layout.current=view;
    apply(view,collapsed.current?0:1,originalSize(view));
    return ()=>{
      cancelAnimationFrame(frame.current);layout.current=null;drag.current=null;
      delete pane.dataset.referenceChrome;
      for(const name of ['title','toolbar','controls'])pane.style.removeProperty('--ref-'+name);
      nav.style.removeProperty('--ref-sticky-top');
    };
  },[]);
  function finish(next:boolean,sizes?:Size,anchor?:Anchor){
    const view=layout.current;if(!view)return;
    const at=anchor??readingAnchor(view);
    apply(view,next?0:1,sizes??originalSize(view),at);
    collapsed.current=next;setHidden(next);saved=next;
    try{sessionStorage.setItem(key,next?'1':'0');}catch{}
    cancelAnimationFrame(frame.current);
    frame.current=requestAnimationFrame(()=>{
      if(layout.current!==view)return;
      keepLine(view,at);
    });
  }
  function pointerDown(e:React.PointerEvent<HTMLDivElement>){
    const view=layout.current;
    if(!view||!e.isPrimary||e.button!==0)return;
    e.preventDefault();cancelAnimationFrame(frame.current);
    const anchor=readingAnchor(view);
    drag.current={id:e.pointerId,y:e.clientY,from:collapsed.current?0:1,anchor,sizes:originalSize(view)};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e:React.PointerEvent<HTMLDivElement>){
    const d=drag.current,view=layout.current;
    if(!d||d.id!==e.pointerId||!view)return;
    const travel=Math.max(30,d.sizes.title+d.sizes.toolbar+d.sizes.controls);
    const fraction=Math.max(0,Math.min(1,d.from+(e.clientY-d.y)/travel));
    apply(view,fraction,d.sizes,d.anchor);
  }
  function pointerEnd(e:React.PointerEvent<HTMLDivElement>){
    const d=drag.current;if(!d||d.id!==e.pointerId)return;
    drag.current=null;
    const dy=e.clientY-d.y;
    finish(e.type==='pointercancel'||Math.abs(dy)<6?d.from===0:dy<0,d.sizes,d.anchor);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return <div className="reference-chrome-bar" ref={bar}>
    <div className="reference-chrome-handle" role="separator" aria-orientation="horizontal" tabIndex={0}
      aria-label="참고문헌 도구 경계" aria-valuemin={0} aria-valuemax={100} aria-valuenow={hidden?0:100}
      title="위로 끌면 도구를 숨기고 아래로 끌면 펼칩니다" onPointerDown={pointerDown} onPointerMove={pointerMove}
      onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onKeyDown={e=>{
        if(!['ArrowUp','ArrowDown','Home','End','Enter',' '].includes(e.key))return;
        e.preventDefault();
        finish(e.key==='ArrowUp'||e.key==='Home'?true:e.key==='ArrowDown'||e.key==='End'?false:!collapsed.current);
      }}><span aria-hidden="true"/></div>
    <button className="reference-chrome-toggle" type="button" aria-expanded={!hidden} aria-label={hidden?'참고문헌 도구 펼치기':'참고문헌 도구 숨기기'} onClick={()=>finish(!collapsed.current)}>{hidden?'도구 펼치기':'도구 숨기기'}</button>
  </div>;
}
