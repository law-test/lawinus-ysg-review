import {useEffect,type RefObject} from 'react';

type Margins={top:number;bottom:number};
export type DocumentBounds={top:number;bottom:number;width:number;visible:boolean;applied?:Margins};
export type DocumentAlignment={thesis:Margins;source:Margins;aligned:boolean};
const zero=():DocumentAlignment=>({thesis:{top:0,bottom:0},source:{top:0,bottom:0},aligned:false});
const round=(value:number)=>Math.round(Math.max(0,value)*100)/100;

/** Compare the unadjusted scrollports, never their independently scrolled pages. */
export function calculateDocumentAlignment(thesis:DocumentBounds,source:DocumentBounds,minimumHeight=80):DocumentAlignment{
 const valid=(bounds:DocumentBounds)=>bounds.visible&&Number.isFinite(bounds.top)&&Number.isFinite(bounds.bottom)&&Number.isFinite(bounds.width)&&bounds.width>0&&bounds.bottom>bounds.top;
 if(!valid(thesis)||!valid(source))return zero();
 const natural=(bounds:DocumentBounds)=>({top:bounds.top-(bounds.applied?.top??0),bottom:bounds.bottom+(bounds.applied?.bottom??0)});
 const left=natural(thesis),right=natural(source),top=Math.max(left.top,right.top),bottom=Math.min(left.bottom,right.bottom);
 if(bottom-top<minimumHeight)return zero();
 return {thesis:{top:round(top-left.top),bottom:round(left.bottom-bottom)},source:{top:round(top-right.top),bottom:round(right.bottom-bottom)},aligned:true};
}

/** Size changes are grouped into one frame; the PDF's padding and scroll offset stay untouched. */
export function connectDocumentAlignment(container:HTMLElement):()=>void{
 const win=container.ownerDocument.defaultView!;
 const applied=new Map<HTMLElement,Margins>();
 const observed=new Set<Element>();
 let frame=0,stopped=false;
 const schedule=()=>{if(!stopped&&!frame)frame=win.requestAnimationFrame(measure);};
 const resize=new ResizeObserver(schedule);
 function setMargins(element:HTMLElement,margins:Margins){
  const previous=applied.get(element)??{top:0,bottom:0};
  if(Math.abs(previous.top-margins.top)<.25&&Math.abs(previous.bottom-margins.bottom)<.25)return;
  if(margins.top===0&&margins.bottom===0){element.style.removeProperty('--document-align-top');element.style.removeProperty('--document-align-bottom');applied.delete(element);}
  else{element.style.setProperty('--document-align-top',margins.top+'px');element.style.setProperty('--document-align-bottom',margins.bottom+'px');applied.set(element,margins);}
 }
 function observeStages(stages:(HTMLElement|null)[]){
  const next=new Set<Element>([container]);
  for(const stage of stages){
   if(!stage)continue;
   let node:Element|null=stage;
   while(node&&node!==container){next.add(node);const parent:Element|null=node.parentElement;if(parent)for(const sibling of parent.children)next.add(sibling);node=parent;}
  }
  for(const element of observed)if(!next.has(element)){resize.unobserve(element);observed.delete(element);}
  for(const element of next)if(!observed.has(element)){resize.observe(element);observed.add(element);}
 }
 function bounds(element:HTMLElement):DocumentBounds{
  const rect=element.getBoundingClientRect();
  return {top:rect.top,bottom:rect.bottom,width:rect.width,visible:element.getClientRects().length>0&&element.clientHeight>0,applied:applied.get(element)};
 }
 function measure(){
  frame=0;if(stopped)return;
  const thesis=container.querySelector<HTMLElement>('.thesis-pane .continuous-pdf');
  const source=container.querySelector<HTMLElement>('.source-viewer-pane .continuous-pdf');
  observeStages([thesis,source]);
  for(const element of applied.keys())if(element!==thesis&&element!==source)setMargins(element,{top:0,bottom:0});
  const result=win.innerWidth>=1200&&thesis&&source?calculateDocumentAlignment(bounds(thesis),bounds(source)):zero();
  if(thesis)setMargins(thesis,result.thesis);
  if(source)setMargins(source,result.source);
 }
 const mutation=new MutationObserver(schedule);
 mutation.observe(container,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});
 const fontMutation=new MutationObserver(schedule);
 fontMutation.observe(container.ownerDocument.documentElement,{attributes:true,attributeFilter:['data-text-size','style']});
 win.addEventListener('resize',schedule);
 measure();
 return()=>{stopped=true;win.cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();fontMutation.disconnect();win.removeEventListener('resize',schedule);for(const element of [...applied.keys()])setMargins(element,{top:0,bottom:0});};
}

export function useDocumentAlignment(container:RefObject<HTMLElement|null>,enabled:boolean){
 useEffect(()=>{if(enabled&&container.current)return connectDocumentAlignment(container.current);},[container,enabled]);
}
