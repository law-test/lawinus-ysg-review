import {privateResource,readSession,storeSession,visit,ReaderError,type Session} from './reader-api.ts';

type Line={text:string;x:number;y:number;w:number;h:number};
type Page={width:number;height:number;lines:Line[]};
const manifests=new Map<string,Promise<{pages:({page:number}&Page)[]}>>();
let connecting:Promise<Session>|undefined;
async function readerSession(){
  const current=readSession();if(current)return current;
  return connecting??=(async()=>{const session=await visit();storeSession(session);return session;})().finally(()=>{connecting=undefined;});
}
async function resource(query:string,signal:AbortSignal){
  const session=await readerSession();
  try{return await privateResource(session,new URLSearchParams(query),signal);}
  catch(error){
    if(!(error instanceof ReaderError)||![401,403].includes(error.status))throw error;
    storeSession(null);
    return privateResource(await readerSession(),new URLSearchParams(query),signal);
  }
}
export async function protectedReferenceText(sourceId:string,signal:AbortSignal){
  const response=await resource(new URLSearchParams({metadata:'reference',source:sourceId}).toString(),signal);
  const data=await response.json();
  if(data.format!=='text'||!Array.isArray(data.content))throw Error('원문 형식을 확인하지 못했습니다.');
  return data.content.map((block:string|{text:string})=>typeof block==='string'?block:block.text).join('\n\n');
}
export async function protectedReviewMetadata(kind:'manifest'|'profile'){
  return (await resource('metadata=review-'+kind,new AbortController().signal)).json();
}
export async function drawProtectedThesisPage(page:number,width:number,canvas:HTMLCanvasElement,textLayer:HTMLDivElement,signal:AbortSignal,sourceId?:string){
  let pageData:Promise<Page>;
  if(sourceId){
    let manifest=manifests.get(sourceId);
    if(!manifest){manifest=resource(new URLSearchParams({metadata:'reference',source:sourceId}).toString(),new AbortController().signal).then(r=>r.json());manifests.set(sourceId,manifest);manifest.catch(()=>manifests.delete(sourceId));}
    pageData=manifest.then(data=>{const p=data.pages.find(p=>p.page===page);if(!p)throw Error('원전 쪽을 찾을 수 없습니다.');return {...p,lines:[]};});
  }else pageData=resource('metadata=page&page='+page,signal).then(r=>r.json());
  const [imageResponse,data]=await Promise.all([resource(new URLSearchParams({page:String(page),...(sourceId?{source:sourceId}:{})}).toString(),signal),pageData]);
  const blob=await imageResponse.blob();
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  const bitmap=await createImageBitmap(blob);
  try{
    if(signal.aborted)throw new DOMException('Aborted','AbortError');
    const height=width*data.height/data.width;
    canvas.width=bitmap.width;canvas.height=bitmap.height;
    canvas.style.width=width+'px';canvas.style.height=height+'px';
    canvas.getContext('2d')!.drawImage(bitmap,0,0);
    textLayer.replaceChildren();textLayer.style.width=width+'px';textLayer.style.height=height+'px';
    const measure=document.createElement('canvas').getContext('2d')!;
    for(const line of data.lines){
      const span=document.createElement('span'),fontSize=line.h*height*.9;
      const font='Arial,"Malgun Gothic",sans-serif';measure.font=fontSize+'px '+font;
      span.textContent=line.text;span.style.cssText=`position:absolute;left:${line.x*100}%;top:${line.y*100}%;height:${line.h*height}px;font-size:${fontSize}px;line-height:${line.h*height}px;font-family:${font};transform-origin:left top;transform:scaleX(${line.w*width/Math.max(1,measure.measureText(line.text).width)});white-space:pre;color:transparent;`;
      textLayer.appendChild(span);
    }
    return {width:data.width,height:data.height};
  }finally{bitmap.close();}
}
