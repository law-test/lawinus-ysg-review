import React,{useCallback,useEffect,useRef,useState} from 'react';
import {draggedPaneSize,keyboardPaneSize} from './pane-size';

type Props={label:string;className?:string;value:number;min:number;max:number;step?:number;unit?:string;onChange:(value:number)=>void;unitsPerPixel?:()=>number};
type Drag={pointerId:number;startX:number;startValue:number;scale:number;element:HTMLDivElement;cursor:string;userSelect:string};

export default function PaneResizer({label,className='',value,min,max,step=2,unit='%',onChange,unitsPerPixel=()=>1}:Props){
  const drag=useRef<Drag|null>(null);
  const [active,setActive]=useState(false);
  const finish=useCallback(()=>{
    const previous=drag.current;
    if(!previous)return;
    drag.current=null;
    document.body.style.cursor=previous.cursor;
    document.body.style.userSelect=previous.userSelect;
    if(previous.element.hasPointerCapture(previous.pointerId))previous.element.releasePointerCapture(previous.pointerId);
    setActive(false);
  },[]);
  useEffect(()=>{window.addEventListener('blur',finish);return()=>{window.removeEventListener('blur',finish);finish();};},[finish]);
  return <div className={`pane-resizer ${className}${active?' resizing':''}`} role="separator" aria-label={label} title="드래그하여 너비 조절" aria-orientation="vertical" aria-valuenow={Math.round(value)} aria-valuetext={`${Math.round(value)}${unit}`} aria-valuemin={min} aria-valuemax={max} tabIndex={0}
    onPointerDown={e=>{
      if(e.button!==0||!e.isPrimary)return;
      e.preventDefault();
      finish();
      e.currentTarget.focus({preventScroll:true});
      drag.current={pointerId:e.pointerId,startX:e.clientX,startValue:value,scale:unitsPerPixel(),element:e.currentTarget,cursor:document.body.style.cursor,userSelect:document.body.style.userSelect};
      e.currentTarget.setPointerCapture(e.pointerId);
      document.body.style.cursor='col-resize';document.body.style.userSelect='none';setActive(true);
    }}
    onPointerMove={e=>{const current=drag.current;if(!current||current.pointerId!==e.pointerId)return;e.preventDefault();onChange(draggedPaneSize(current.startValue,current.startX,e.clientX,current.scale,min,max));}}
    onPointerUp={e=>{if(drag.current?.pointerId===e.pointerId)finish();}}
    onPointerCancel={e=>{if(drag.current?.pointerId===e.pointerId)finish();}}
    onLostPointerCapture={finish}
    onKeyDown={e=>{const next=keyboardPaneSize(e.key,value,min,max,step);if(next!==null){e.preventDefault();onChange(next);}}}
  ><span/></div>;
}
