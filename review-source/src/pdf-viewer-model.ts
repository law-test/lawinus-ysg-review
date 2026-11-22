export type PdfRect = [number,number,number,number];
export type PdfTarget = {page:number;rect:PdfRect;noteId:string;number:number;kind:string};
type NoteGeometry = {id:string;number:number;clickTargets?:{page:number;rect:number[];kind?:string}[];noteHighlights?:{page:number;rect:number[];kind?:string}[]};
export type PageSize = {width:number;height:number};

// A new import generation bypasses PDF.js's cached worker-initialization failure.
// Existing documents retain their own runtime and are never destroyed here.
export function createPdfRuntimeCache<T>(load:(attempt:number)=>Promise<T>){
  let attempt=0,pending:Promise<T>|undefined;
  return {
    get(){
      if(!pending){
        const current=attempt;
        pending=Promise.resolve().then(()=>load(current)).catch(error=>{
          if(attempt===current){pending=undefined;attempt++;}
          throw error;
        });
      }
      return pending;
    },
    retry(){pending=undefined;attempt++;},
  };
}

export function validRect(value:unknown): value is PdfRect {
  return Array.isArray(value)&&value.length===4&&value.every(Number.isFinite)&&value[2]>value[0]&&value[3]>value[1];
}
// Keep every evidence-backed line separate. A union rectangle would make blank
// space or a neighboring footnote clickable and lose continuation-page geometry.
export function footnoteTargets(notes:NoteGeometry[]):PdfTarget[]{
  const result:PdfTarget[]=[];const seen=new Set<string>();
  for(const note of notes)for(const target of [...(note.clickTargets||[]),...(note.noteHighlights||[])]){
    if(!Number.isInteger(target.page)||target.page<1||!validRect(target.rect))continue;
    const key=[note.id,target.page,...target.rect].join('|');if(seen.has(key))continue;seen.add(key);
    result.push({page:target.page,rect:[...target.rect],noteId:note.id,number:note.number,kind:target.kind||'footnote-text'});
  }
  return result;
}
export function targetAt(targets:PdfTarget[],x:number,y:number):PdfTarget|undefined{
  // Prefer the smallest exact region if a marker and its own first line overlap.
  return targets.filter(t=>x>=t.rect[0]&&x<=t.rect[2]&&y>=t.rect[1]&&y<=t.rect[3])
    .sort((a,b)=>(a.rect[2]-a.rect[0])*(a.rect[3]-a.rect[1])-(b.rect[2]-b.rect[0])*(b.rect[3]-b.rect[1]))[0];
}
// Only a direct touch/pen tap may reach a nearby tiny footnote number. Distances
// are measured on screen, so zoom never turns the allowance into a larger one.
export function pointerTargetAt(targets:PdfTarget[],x:number,y:number,pointerType:string,scaleX:number,scaleY:number):PdfTarget|undefined{
  const exact=targetAt(targets,x,y);
  if(!['touch','pen'].includes(pointerType))return exact;
  const exactNote=targetAt(targets.filter(target=>target.kind!=='paragraph'),x,y);
  if(exactNote)return exactNote;
  if(!Number.isFinite(scaleX)||!Number.isFinite(scaleY)||scaleX<=0||scaleY<=0)return exact;
  const nearest=new Map<string,{target:PdfTarget;distance:number}>();
  for(const target of targets){
    if(target.kind!=='body-marker'&&target.kind!=='footnote-marker')continue;
    const r=target.rect,dx=Math.max(r[0]-x,0,x-r[2])*scaleX,dy=Math.max(r[1]-y,0,y-r[3])*scaleY;
    const distance=Math.hypot(dx,dy);if(distance>8)continue;
    const previous=nearest.get(target.noteId);if(!previous||distance<previous.distance)nearest.set(target.noteId,{target,distance});
  }
  const candidates=[...nearest.values()].sort((a,b)=>a.distance-b.distance);
  if(!candidates.length)return exact;
  // A subpixel tie between different notes is ambiguous; do not guess.
  if(candidates[1]&&candidates[1].distance-candidates[0].distance<=.5)return undefined;
  return candidates[0].target;
}
export function normalizedPoint(clientX:number,clientY:number,box:{left:number;top:number;width:number;height:number}){
  return {x:Math.max(0,Math.min(1,(clientX-box.left)/box.width)),y:Math.max(0,Math.min(1,(clientY-box.top)/box.height))};
}
export function pageLayout(count:number,width:number,zoom:number,sizes:Record<number,PageSize>,fallback:PageSize={width:515,height:728},gap=24){
  const heights:number[]=[],offsets=[0];const fitted=Math.max(160,width)*zoom;
  for(let p=1;p<=Math.max(1,count);p++){const size=sizes[p]||fallback;const h=fitted*size.height/size.width;heights.push(h);offsets.push(offsets[p-1]+h+gap);}
  return {heights,offsets,width:fitted,totalHeight:offsets.at(-1)!-gap,gap};
}
export function pageIndexAt(offsets:number[],position:number){
  let low=0,high=offsets.length-2;
  while(low<high){const mid=Math.ceil((low+high)/2);if(offsets[mid]<=position)low=mid;else high=mid-1;}
  return Math.max(0,Math.min(offsets.length-2,low));
}
export function visiblePageRange(offsets:number[],scrollTop:number,viewportHeight:number,overscan=1){
  const start=Math.max(0,pageIndexAt(offsets,Math.max(0,scrollTop))-overscan);
  const end=Math.min(offsets.length-2,pageIndexAt(offsets,Math.max(0,scrollTop)+Math.max(1,viewportHeight))+overscan);
  return Array.from({length:end-start+1},(_,i)=>start+i+1);
}
export function reflowScrollPosition(previous:ReturnType<typeof pageLayout>,next:ReturnType<typeof pageLayout>,position:number){
  const oldTop=Math.max(0,position),index=pageIndexAt(previous.offsets,oldTop),fraction=(oldTop-previous.offsets[index])/previous.heights[index];
  const target=Math.min(index,next.heights.length-1);
  return next.offsets[target]+Math.max(0,Math.min(1,fraction))*next.heights[target];
}
export function reflowHorizontalPosition(previousWidth:number,nextWidth:number,position:number){
  if(!Number.isFinite(previousWidth)||previousWidth<=0||!Number.isFinite(nextWidth)||nextWidth<=0)return Math.max(0,Number.isFinite(position)?position:0);
  return Math.max(0,Number.isFinite(position)?position:0)*nextWidth/previousWidth;
}
export function pendingPdfReflow(committed:ReturnType<typeof pageLayout>|undefined,rendered:ReturnType<typeof pageLayout>,renderedWidth:number,measuredWidth:number){
  return committed!==rendered||Math.abs(renderedWidth-measuredWidth)>.5;
}
export function movedPointer(start:{x:number;y:number}|null,x:number,y:number){return !!start&&Math.hypot(x-start.x,y-start.y)>5;}
export function measurableViewport(width:number,height:number,paddingX=0):{width:number;height:number}|null{
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null;
  return {width:Math.max(160,width-(Number.isFinite(paddingX)?paddingX:0)),height};
}

// Limit raster allocation only. CSS size, PDF coordinates, and zoom stay intact.
export function pdfCanvasSize(width:number,height:number,deviceRatio:number,compact=false){
  const w=Math.max(1,Number.isFinite(width)?width:1),h=Math.max(1,Number.isFinite(height)?height:1);
  const ratio=Number.isFinite(deviceRatio)&&deviceRatio>0?Math.min(deviceRatio,2):1;
  const maxPixels=compact?2_000_000:4_000_000,maxDimension=4096;
  const scale=Math.min(ratio,Math.sqrt(maxPixels/(w*h)),maxDimension/w,maxDimension/h);
  return {width:Math.max(1,Math.floor(w*scale)),height:Math.max(1,Math.floor(h*scale)),scale};
}

export function pdfLoadError(error:unknown){
  const item=error as {name?:string;message?:string};
  if(item?.name==='PasswordException')return '암호가 필요한 PDF입니다. 원문을 새 창에서 열어 주세요.';
  if(item?.name==='InvalidPDFException')return 'PDF 내용을 읽지 못했습니다. 다시 불러오거나 원문을 새 창에서 열어 주세요.';
  if(item?.name==='MissingPDFException'||item?.name==='UnexpectedResponseException')return 'PDF 파일을 가져오지 못했습니다. 연결을 확인한 뒤 다시 불러와 주세요.';
  if(/withResolvers|Promise\.try|not a function|Unexpected token|unsupported/i.test(item?.message||''))return '이 브라우저에서 PDF를 표시하지 못했습니다. 원문을 새 창에서 열거나 브라우저를 업데이트해 주세요.';
  return 'PDF를 불러오지 못했습니다. 다시 불러오거나 원문을 새 창에서 열어 주세요.';
}

// Pointer-up is not guaranteed when the browser loses focus or leaves the page.
// Keep a hand drag from resuming unexpectedly when the reader returns.
export function watchDocumentInterruption(cancel:()=>void,win:EventTarget,doc:EventTarget&{hidden:boolean}){
  const visibility=()=>{if(doc.hidden)cancel();};
  win.addEventListener('blur',cancel);win.addEventListener('pagehide',cancel);doc.addEventListener('visibilitychange',visibility);
  return()=>{win.removeEventListener('blur',cancel);win.removeEventListener('pagehide',cancel);doc.removeEventListener('visibilitychange',visibility);};
}
