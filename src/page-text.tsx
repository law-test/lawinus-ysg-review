import React,{createContext,useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ReaderError,type Session} from './reader-api';
import {pageCache} from './visible-page-cache';
import separators from './line-separators.json';
import footnoteRows from './footnote-rows.json';
import {repairLawTargets} from './verified-law-targets';
import {bibliographyURL,repairCitationTargets} from './citation-links';
import sectionData from './section-link-data.json';
import {sectionHref} from './section-navigation';
import {footnoteCaseTargets,docketInTitle} from './footnote-cases';
import sourceSpanData from './footnote-source-spans.json';
import crossrefData from './footnote-source-crossrefs.json';
import caseSpanData from './case-citation-spans.json';
import {commentaryTargets} from './commentary-locations';
import {repairCitationBoundaries,sourceTargetAtPoint} from './citation-boundaries';
import copySpaceMap from './copy-space-map.json';
import {restoreCopySpacing,type CopySpacing} from './copy-spacing';
const copySpaces=copySpaceMap as Record<string,Record<string,CopySpacing>>;

export type Rect={x:number;y:number;w:number;h:number};
export type TextLine=Rect&{text:string;size?:number;index?:number};
export type PageTarget=Rect&{commentaryToken?:boolean;kind:'law'|'case'|'note'|'cross'|'external'|'section';number?:number;targetPage?:number;targetY?:number;noteNumber?:number;noteStart?:number;noteEnd?:number;sourceId?:string;sourcePage?:number;sourceGroup?:string;caseGroup?:string;firstPage?:number;rects?:Rect[];line?:number;caseNumber?:string;lawKey?:string;articleId?:string;title?:string;label?:string;url?:string;status?:string;articleText?:string;start?:number;end?:number};
const sectionTargets=sectionData as Record<string,PageTarget[]>;
type SourceSpan={number:number;id:string;sourceId?:string;sourcePage?:number;label:string;noteStart:number;noteEnd:number;rects:(Rect&{line:number})[]};
const sourceSpans=sourceSpanData as Record<string,SourceSpan[]>;
type CaseSpan={id:string;caseNumber:string;label:string;firstPage:number;noteStart?:number;noteEnd?:number;noteNumber?:number;url?:string;sourceId?:string;rects:(Rect&{line:number;start:number;end:number})[]};
const caseSpans=caseSpanData as Record<string,CaseSpan[]>;
// These coordinates ship with the reader. They are immediately usable when a
// manuscript page mounts, even while its legacy link map or text is in flight.
const nestedCrossrefs=crossrefData as unknown as Record<string,[number,number,number,number,number,number,number,string][]>;
const bundledPages=new Map<number,PageMetadata>();
function bundledPage(page:number):PageMetadata{
  const found=bundledPages.get(page);
  if(found)return found;
  const works=sourceTargets(page);
  const expanded=(caseSpans[page]||[]).map((s):PageTarget=>{
    const inTitle=s.noteStart!==undefined&&s.noteEnd!==undefined&&works.some(work=>
      work.noteNumber===s.noteNumber&&work.noteStart!<s.noteStart!&&work.noteEnd!>=s.noteEnd!);
    const digits=inTitle?docketInTitle(page,s.caseNumber,s.noteStart!,s.noteEnd!,s.noteNumber):[];
    const rects=digits.length?digits:s.rects;
    return {...rects[0],kind:'case',caseNumber:s.caseNumber,caseGroup:s.id,firstPage:s.firstPage,
      noteStart:digits[0]?.noteStart??s.noteStart,noteEnd:digits[0]?.noteEnd??s.noteEnd,
      noteNumber:s.noteNumber,sourceId:s.sourceId,label:digits.length?s.caseNumber:s.label,
      title:s.label,url:s.url,rects};
  });
  const cross=(nestedCrossrefs[page]||[]).map(([number,noteNumber,targetPage,x,y,w,h,label]):PageTarget=>
    ({kind:'cross',number,noteNumber,targetPage,x,y,w,h,label,title:'제출본 각주 '+number}));
  const data={lines:[],targets:[...expanded,...works,...cross,...(sectionTargets[page]||[])].filter(box)};
  bundledPages.set(page,data);
  return data;
}
const firstSourcePage=new Map<string,number>();
for(const [page,spans] of Object.entries(sourceSpans))
  for(const s of spans)if(!firstSourcePage.has(s.id))firstSourcePage.set(s.id,Number(page));
function sourceTargets(page:number):PageTarget[]{
  return (sourceSpans[page]||[]).filter(s=>s.rects.length>0).map(s=>({
    ...s.rects[0],kind:'note',number:s.number,noteNumber:s.number,sourceGroup:s.id,
    sourceId:s.sourceId,sourcePage:s.sourcePage,noteStart:s.noteStart,noteEnd:s.noteEnd,
    title:s.label,label:s.label,rects:s.rects,
  }));
}
// Entries spanning two sheets retain one identity in the note and the picker.
const worksByNote=new Map<number,SourceSpan[]>();
for(const [sheet,spans] of Object.entries(sourceSpans)){
  for(const span of spans){
    if(firstSourcePage.get(span.id)!==Number(sheet))continue;
    const works=worksByNote.get(span.number)||[];
    works.push(span);
    worksByNote.set(span.number,works);
  }
}
export function worksInNote(number:number){return worksByNote.get(number)||[];}
function registerWorks(page:number,targets:PageTarget[]){
  let changed=false;
  for(const t of targets){
    if(!t.sourceGroup||!t.number||t.noteStart===undefined||t.noteEnd===undefined)continue;
    if(!firstSourcePage.has(t.sourceGroup))firstSourcePage.set(t.sourceGroup,t.firstPage||page);
    const works=worksByNote.get(t.number)||[];
    if(works.some(work=>work.id===t.sourceGroup))continue;
    works.push({id:t.sourceGroup,number:t.number,sourceId:t.sourceId,sourcePage:t.sourcePage,label:t.title||t.label||'',noteStart:t.noteStart,noteEnd:t.noteEnd,rects:(t.rects||[t]).map(r=>({...r,line:0}))});
    worksByNote.set(t.number,works);changed=true;
  }
  if(changed)window.dispatchEvent(new Event('ysg:source-links'));
}
export function useWorksRevision(){
  const [revision,setRevision]=useState(0);
  useEffect(()=>{const refresh=()=>setRevision(v=>v+1);window.addEventListener('ysg:source-links',refresh);return()=>window.removeEventListener('ysg:source-links',refresh);},[]);
  return revision;
}
type PageMetadata={lines:TextLine[];targets:PageTarget[];width?:number;height?:number};
export type InlineLink={start:number;end:number;target:PageTarget};

function box(r:Rect){return [r.x,r.y,r.w,r.h].every(Number.isFinite)&&r.w>0&&r.h>0&&r.x>=-.015&&r.y>=-.015&&r.x<1.02&&r.y<1.02;}
const openMetadata=pageCache<PageMetadata>(12,2*1024*1024,async response=>{
  const raw=(await response.json()) as PageMetadata;
  if(!Array.isArray(raw.lines))throw Error('쪽의 문자 정보를 확인하지 못했습니다.');
  return {...raw,lines:raw.lines.flatMap((line,index)=>typeof line.text==='string'&&box(line)?[{...line,index}]:[]),targets:(raw.targets||[]).filter(box)};
},data=>data.lines.reduce((bytes,line)=>bytes+line.text.length*2+80,0)+data.targets.reduce((bytes,t)=>bytes+(t.articleText?.length||0)*2+128,0));

function mergedTargets(page:number,targets:PageTarget[]){
  const repaired=footnoteCaseTargets(page,repairCitationTargets(page,repairLawTargets(page,targets)));
  const all=commentaryTargets(repairCitationBoundaries(page,[...repaired,...bundledPage(page).targets].filter(box)));
  const unique=all.filter((t,i)=>!all.slice(0,i).some(p=>p.kind===t.kind&&p.number===t.number&&p.sourceId===t.sourceId&&p.sourceGroup===t.sourceGroup&&p.caseNumber===t.caseNumber&&p.lawKey===t.lawKey&&p.articleId===t.articleId&&Math.abs(p.x-t.x)<.001&&Math.abs(p.y-t.y)<.001));
  registerWorks(page,unique);
  return unique;
}
async function pageMap(session:Session,page:number){
  const item=openMetadata(session,'metadata=page&page='+page);
  try{return mergedTargets(page,(await item.promise).targets);}
  finally{item.release();}
}
export function usePageMetadata(session:Session,query:string,active=true,textAllowed=false) {
  const [state,setState]=useState<{query:string;token:string;data?:PageMetadata;error?:string}>({query:'',token:''});
  const [attempt,setAttempt]=useState(0);
  const params=new URLSearchParams(query);
  const page=params.get('metadata')==='page'?Number(params.get('page')):0;
  const initial=active&&Number.isInteger(page)&&page>0&&page<=209?bundledPage(page):undefined;
  useEffect(()=>{
    if(!active)return;
    let alive=true,timer=0;
    let targets:PageTarget[]=initial?.targets||[],lines:TextLine[]=[];
    const publish=()=>{if(alive)setState({query,token:session.token,data:{lines,targets}});};
    // The protected page metadata owns both coordinates and the exact text.
    // Fetch it on mount so the first click works even before text selection.
    const item=openMetadata(session,query);
    item.promise.then(data=>{lines=textAllowed?data.lines:[];targets=page?mergedTargets(page,data.targets):data.targets;publish();},e=>{
      if(!alive)return;
      if(e instanceof ReaderError&&e.status===429)timer=window.setTimeout(()=>setAttempt(v=>v+1),e.wait*1000);
      setState({query,token:session.token,data:{lines,targets},error:'글자를 불러오지 못했습니다.'});
    });
    return ()=>{alive=false;clearTimeout(timer);item.release();};
  },[session,query,page,initial,active,attempt,textAllowed]);
  const current=active&&state.token===session.token&&state.query===query?state:undefined;
  return {data:current?.data??initial,error:current?.error,retry:()=>setAttempt(v=>v+1)};
}

export function officialURL(raw?:string){
  if(!raw)return undefined;
  try{
    const link=new URL(raw);
    const host=link.hostname;
    const allowed=['law.go.kr','scourt.go.kr','assembly.go.kr','elaw.klri.re.kr','gesetze-im-internet.de','e-gov.go.jp','japaneselawtranslation.go.jp','uscode.house.gov','govinfo.gov','bundesgerichtshof.de','gesetze-bayern.de','dejure.org','courts.go.jp'];
    if(link.protocol!=='https:'||link.username||link.password||!allowed.some(domain=>host===domain||host.endsWith('.'+domain)))return undefined;
    // Older maps cite this provision through a retired government endpoint.
    const params=link.searchParams;
    if(host==='www.law.go.kr'&&link.pathname==='/LSW/lsSideInfoP.do'&&params.get('joNo')==='0025'&&params.get('joBrNo')==='13'){
      const sequence=params.get('lsiSeq')||'';
      const dates:Record<string,string>={'285963':'20261113','290655':'20261002'};
      if(Object.hasOwn(dates,sequence)){
        link.pathname='/LSW/lsInfoR.do';
        link.search=new URLSearchParams({lsiSeq:sequence,efYd:dates[sequence],chrClsCd:'010202',joNo:'0025',joBrNo:'13'}).toString();
        link.hash='Y002513';
      }
    }
    return link.href;
  }catch{return undefined;}
}
export function targetLabel(t:PageTarget){return t.sourceGroup?t.title||'각주 '+t.number:t.kind==='note'&&!t.sourceId?'각주 '+t.number:(t.caseNumber||t.kind==='external'||t.kind==='section'||t.sourceId?t.title:undefined)||t.label||t.title||'원문 확인';}
function positioning(r:Rect){return {left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%'};}
const within=(p:{x:number;y:number},r:Rect)=>p.x>=r.x&&p.y>=r.y&&p.x<=r.x+r.w&&p.y<=r.y+r.h;
const plainNote=(t:PageTarget)=>t.kind==='note'&&!t.sourceId&&!t.sourceGroup;
export const printedFootnotes=footnoteRows as Record<string,number[]>;

// Adjacent mounted pages can contain two parts of the same citation.
const HighlightContext=createContext<{
  active?:string;point:(id?:string)=>void;focus:(id?:string)=>void;
}>({point:()=>{},focus:()=>{}});
export function SourceHighlightScope({children}:{children:React.ReactNode}){
  const [pointer,point]=useState<string>(),[keyboard,setKeyboard]=useState<string>();
  function focus(id?:string){
    if(id)point(undefined);
    setKeyboard(id);
  }
  return <HighlightContext.Provider value={{active:pointer??keyboard,point,focus}}>{children}</HighlightContext.Provider>;
}

export function copyManuscriptSelection(event:React.ClipboardEvent<HTMLElement>){
  const selection=window.getSelection();
  if(!selection||selection.isCollapsed||!selection.rangeCount)return;
  const range=selection.getRangeAt(0);
  if(!event.currentTarget.contains(range.commonAncestorContainer))return;
  const output:string[]=[];
  for(const span of event.currentTarget.querySelectorAll<HTMLElement>('.page-text-run')){
    if(!range.intersectsNode(span))continue;
    const clipped=document.createRange();clipped.selectNodeContents(span);
    if(range.compareBoundaryPoints(Range.START_TO_START,clipped)>0)clipped.setStart(range.startContainer,range.startOffset);
    if(range.compareBoundaryPoints(Range.END_TO_END,clipped)<0)clipped.setEnd(range.endContainer,range.endOffset);
    let value=clipped.toString();if(!value)continue;
    if(output.length){
      const join=span.dataset.joinBefore??'\n';
      if(join===' '||join===''){
        output[output.length-1]=output[output.length-1].trimEnd();
        value=value.trimStart();
      }
      output.push(join);
    }
    output.push(value);
  }
  if(!output.length)return;
  event.clipboardData.setData('text/plain',output.join(''));event.preventDefault();
}
export function PageLayer({session,query,active=true,fallback=[],label,onTarget,textAllowed=false}:{session:Session;query:string;active?:boolean;fallback?:PageTarget[];label:string;textAllowed?:boolean;onTarget?:(t:PageTarget)=>void}){
  const {data,error,retry}=usePageMetadata(session,query,active,textAllowed);
  const host=useRef<HTMLDivElement>(null);
  const start=useRef<{x:number;y:number;touch:boolean;dragged:boolean}|null>(null);
  const lastSource=useRef<string|undefined>(undefined);
  const hover=useRef<HTMLSpanElement>(null);
  const highlight=useContext(HighlightContext);
  const [size,setSize]=useState({w:0,h:0});
  useLayoutEffect(()=>{
    const node=host.current;if(!node)return;
    const update=()=>{const r=node.getBoundingClientRect();setSize(prev=>prev.w===r.width&&prev.h===r.height?prev:{w:r.width,h:r.height});};
    update();const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect();
  },[active]);
  const targets=[...(data?.targets||[]),...fallback.filter(f=>!(data?.targets||[]).some(t=>t.kind===f.kind&&t.number===f.number&&Math.abs(t.x-f.x)<.015&&Math.abs(t.y-f.y)<.01))].sort((a,b)=>a.y-b.y||a.x-b.x);
  const directTargets=targets.filter(t=>!t.sourceGroup&&!t.caseGroup).sort((a,b)=>a.w*a.h-b.w*b.h);
  const page=new URLSearchParams(query).get('page')||'';
  function activate(t:PageTarget){
    if(t.kind==='external'){
      const url=bibliographyURL(t.url);if(url)window.open(url,'_blank','noopener,noreferrer');
      return;
    }
    onTarget?.(t);
  }
  function hit(e:React.MouseEvent,touch=false):PageTarget|undefined{
    const r=host.current!.getBoundingClientRect();if(!r.width||!r.height)return;
    const p={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};
    // An explicitly linked provision or case inside a title keeps its own action.
    const commentary=targets.find(t=>t.commentaryToken&&(t.rects||[t]).some(r=>within(p,r)));
    if(commentary)return commentary;
    const citation=targets.find(t=>t.caseGroup&&t.rects?.some(r=>within(p,r)));
    if(citation)return citation;
    const direct=directTargets.find(t=>within(p,t));
    const source=sourceTargetAtPoint(targets,p);
    if(direct&&(!source||direct.kind!=='note'))return direct;
    if(source)return source;
    // Printed superscripts are narrower than a fingertip. Pick the nearest marker only.
    let best:PageTarget|undefined, distance=Infinity;
    for(const t of targets){
      if(!plainNote(t))continue;
      const dx=Math.max(t.x-p.x,0,p.x-t.x-t.w)*r.width;
      const dy=Math.max(t.y-p.y,0,p.y-t.y-t.h)*r.height;
      const gap=Math.hypot(dx,dy);
      if(gap<=(touch?10:6)&&gap<distance){distance=gap;best=t;}
    }
    return best;
  }
  function point(e:React.PointerEvent){
    if(start.current&&Math.hypot(e.clientX-start.current.x,e.clientY-start.current.y)>4)start.current.dragged=true;
    const node=host.current!, t=hit(e);
    node.title=t?targetLabel(t):'';node.style.cursor=t?'pointer':data?.lines?.length?'text':'default';
    const group=t?.caseGroup||t?.sourceGroup;
    highlight.point(group);
    if(hover.current){hover.current.hidden=!t||!!group;if(t&&!group)Object.assign(hover.current.style,positioning(t));}
  }
  const order=(separators as Record<string,string>)[page]||'';
  if(!active)return null;
  return <div ref={host} className={'page-text-layer'+(data?.lines?.length?' has-text':' links-only')} aria-label={label}
    onPointerMove={point} onPointerLeave={()=>{highlight.point(undefined);if(hover.current)hover.current.hidden=true;}}
    onPointerDown={e=>{start.current=e.button===0&&e.isPrimary?{x:e.clientX,y:e.clientY,touch:e.pointerType==='touch',dragged:false}:null;}}
    onPointerCancel={()=>{start.current=null;}}
    onClick={e=>{
      const press=start.current;start.current=null;
      if(!press||press.dragged||e.shiftKey||Math.hypot(e.clientX-press.x,e.clientY-press.y)>4)return;
      const t=hit(e,press.touch);
      // Adjacent citations can be close enough for two taps to be reported as a
      // double click. Keep text selection on a repeated hit on the same citation.
      const group=t?.caseGroup||t?.sourceGroup;
      const switching=Boolean(group&&lastSource.current&&group!==lastSource.current);
      if(e.detail>1&&!switching)return;
      const selection=window.getSelection();
      if(selection&&!selection.isCollapsed&&(host.current?.contains(selection.anchorNode)||host.current?.contains(selection.focusNode))){
        if(e.detail<=1||!switching)return;
        // A fast second click on a different link can select text before click fires.
        selection.removeAllRanges();
      }
      lastSource.current=group;
      if(t)activate(t);
    }}>
    {data?.lines.map((line,i)=>{
      const index=line.index??i,sep=order[index];
      const restored=restoreCopySpacing(line.text,copySpaces[page]?.[index]);
      return <TextRun key={i} line={{...line,text:restored.text}} width={size.w} height={size.h} joinBefore={restored.joinBefore??(sep==='C'?'':sep==='S'?' ':'\n')}/>;
    })}
    <span ref={hover} className="page-target-hover" aria-hidden="true" hidden/>
    {onTarget&&targets.map((t,i)=>{
      if(t.sourceGroup)return <React.Fragment key={t.sourceGroup}>
        {t.rects?.map((r,j)=><span key={j} aria-hidden="true" data-source-group={t.sourceGroup}
          className={'page-source-part'+(highlight.active===t.sourceGroup?' is-highlighted':'')} style={positioning(r)}/>)}
        <button type="button" className="page-link source-link" style={positioning(t)} data-source-group={t.sourceGroup}
          data-source-id={t.sourceId} data-note-number={t.number} title={targetLabel(t)}
          tabIndex={(t.firstPage??firstSourcePage.get(t.sourceGroup)??Number(page))===Number(page)?0:-1}
          aria-label={(t.number?'각주 '+t.number+' · ':'참고문헌 · ')+targetLabel(t)+' 열기'} onFocus={()=>highlight.focus(t.sourceGroup)} onBlur={()=>highlight.focus(undefined)}
          onClick={e=>{e.stopPropagation();activate(t);}}/>
      </React.Fragment>;
      const url=t.kind==='external'?bibliographyURL(t.url):officialURL(t.url);const name=t.kind==='law'?'조문':t.kind==='case'?'판례':t.kind==='external'?'참고자료':t.kind==='section'?'논문 본문':'각주';
      const cls='page-link '+t.kind+'-link';const props={className:cls,style:positioning(t),title:targetLabel(t),'data-case-number':t.caseNumber,'data-note-number':t.noteNumber,'aria-label':name+' 열기 · '+targetLabel(t)};
      if(t.caseGroup){
        const id=t.caseGroup;
        const focus={tabIndex:(t.firstPage??Number(page))===Number(page)?0:-1,onFocus:()=>highlight.focus(id),onBlur:()=>highlight.focus(undefined)};
        return <React.Fragment key={id}>
          {t.rects?.map((r,j)=><span key={j} aria-hidden="true" data-case-group={id}
            className={'page-source-part'+(highlight.active===id?' is-highlighted':'')} style={positioning(r)}/>)}
          {url?<a {...props} {...focus} data-case-group={id} href={url} target="_blank" rel="noopener noreferrer" onClick={e=>{
            e.stopPropagation();if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){e.preventDefault();activate(t);}
          }}/>:<button {...props} {...focus} data-case-group={id} type="button" onClick={e=>{e.stopPropagation();activate(t);}}/>}
        </React.Fragment>;
      }
      if(t.kind==='section'&&t.targetPage&&t.targetY!==undefined)return <a key={i} {...props}
        data-target-page={t.targetPage} data-target-y={t.targetY} href={sectionHref(t.targetPage,t.targetY)}
        onClick={e=>{e.stopPropagation();if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){e.preventDefault();activate(t);}}}/>;
      return url?<a key={i} {...props} href={url} target="_blank" rel="noopener noreferrer" onClick={e=>{e.stopPropagation();if(t.kind!=='external'&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){e.preventDefault();activate(t);}}}/>:
        (((t.kind==='note'||t.kind==='cross')&&t.number||t.caseNumber||t.articleText||t.status)?<button type="button" key={i} {...props} onClick={e=>{e.stopPropagation();activate(t);}}/>:null);
    })}
    {error&&<button type="button" className="text-error" onClick={e=>{e.stopPropagation();retry();}}>다시 불러오기</button>}
  </div>;
}
let canvas:CanvasRenderingContext2D|null=null;
const font='Arial,"Malgun Gothic",sans-serif';
function TextRun({line,width,height,joinBefore}:{line:TextLine;width:number;height:number;joinBefore:string}){
  const h=line.h*height;
  if(!canvas)canvas=document.createElement('canvas').getContext('2d');
  const fontSize=Math.max(.1,h*.90);if(canvas)canvas.font=fontSize+'px '+font;
  const measured=canvas?.measureText(line.text).width||1;
  return <span className="page-text-run" data-join-before={joinBefore} style={{left:line.x*100+'%',top:line.y*100+'%',height:h,fontSize,lineHeight:h+'px',fontFamily:font,transform:'scaleX('+line.w*width/measured+')'}}>{line.text}</span>;
}

export function NoteText({text,links,onTarget}:{text:string;links:InlineLink[];onTarget:(t:PageTarget)=>void}){
  let cursor=0;const parts:React.ReactNode[]=[];
  for(const link of [...links].sort((a,b)=>a.start-b.start)){
    if(link.start<cursor||link.end<=link.start||link.end>text.length)continue;
    const url=officialURL(link.target.url),internal=link.target.kind==='note'||link.target.kind==='cross'||link.target.kind==='section'||(link.target.kind==='case'&&!url);if(!internal&&!url&&!link.target.articleText&&!link.target.status)continue;
    parts.push(text.slice(cursor,link.start));
    const phrase=text.slice(link.start,link.end);
    parts.push((internal||!url)?<button key={link.start} type="button" className="inline-note-link" data-case-number={link.target.caseNumber}
      data-source-group={link.target.sourceGroup} data-source-id={link.target.sourceId} onClick={()=>onTarget(link.target)}>{phrase}</button>:
      <a key={link.start} href={url} className="inline-note-link" data-case-number={link.target.caseNumber} target="_blank" rel="noopener noreferrer" onClick={e=>{if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey){e.preventDefault();onTarget(link.target);}}}>{phrase}</a>);
    cursor=link.end;
  }
  parts.push(text.slice(cursor));return <>{parts}</>;
}

export function LegalInfo({target,close}:{target:PageTarget;close:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;if(!dialog)return;dialog.showModal();return()=>{if(dialog.open)dialog.close();};},[]);
  const status:Record<string,string>={current:'현행',historical:'연혁',foreign:'외국법',proposal:'입법안',unresolved:'출전 확인 필요'};
  const url=officialURL(target.url);
  return <dialog ref={ref} className="law-popup" aria-label={target.kind==='case'?'판례 열람':'조문 열람'} onCancel={close} onClick={e=>{if(e.target===ref.current){const r=ref.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}}}>
    <header><span>{target.kind==='case'?'판례':'조문'}{target.status&&' · '+(status[target.status]||target.status)}</span><button type="button" onClick={close}>닫기</button></header>
    <h2>{target.title||target.label}</h2>{target.articleText&&<p>{target.articleText}</p>}{url&&<a href={url} target="_blank" rel="noopener noreferrer">공식 원문 열기 ↗</a>}
  </dialog>;
}

// Source rectangles refer to the printed page. The side panel quotes the same note without line wrapping.
export function inlineLinks(text:string,noteNumber:number,targets:PageTarget[]):InlineLink[]{
  const links:InlineLink[]=[];
  const sources=new Map<string,InlineLink>();
  for(const t of targets){
    if(t.sourceGroup){
      const {noteStart:start,noteEnd:end}=t;
      if(t.number===noteNumber&&start!==undefined&&end!==undefined&&start>=0&&end>start&&end<=text.length)
        sources.set(t.sourceGroup,{start,end,target:t});
      continue;
    }
    if((t.noteNumber??(t.sourceId?t.number:undefined))!==noteNumber||(t.kind==='note'&&!t.sourceId))continue;
    const label=(t.label||'').trim();if(!label)continue;
    const compact=label.replace(/\s/g,'');
    if(t.kind==='section'||t.noteStart!==undefined){
      // Printed line offsets and unwrapped note offsets belong to different texts.
      const {noteStart:start,noteEnd:end}=t;
      if(start!==undefined&&end!==undefined&&start>=0&&end>start&&end<=text.length&&(t.kind==='case'||text.slice(start,end).replace(/\s/g,'')===compact)){
        links.push({start,end,target:t});
      }
      continue;
    }
    if(t.start!==undefined&&t.end!==undefined&&text.slice(t.start,t.end).replace(/\s/g,'')===compact){links.push({start:t.start,end:t.end,target:t});continue;}
    const escaped=Array.from(compact,c=>((c==='\\'||'^$.*+?()[]{}|'.includes(c))?'\\':'')+c).join('\\s*');
    const pattern=(/^\d/u.test(compact)?'(?<!\\d)':'')+escaped+(/\d$/u.test(compact)?'(?!\\d)':'');
    for(const match of text.matchAll(new RegExp(pattern,'g')))links.push({start:match.index!,end:match.index!+match[0].length,target:t});
  }
  // A repeated short label (for example 제415조) is only a text match. It cannot
  // occupy part of a citation matched to its exact offsets in the printed footnote.
  const caseLinks=links.filter(l=>l.target.caseGroup);
  const applicable=links.filter(l=>l.target.caseGroup||!caseLinks.some(c=>c.start<l.end&&l.start<c.end));
  const exact = applicable.filter(l => l.target.noteStart === l.start && l.target.noteEnd === l.end &&
    (l.target.kind === 'law' || (l.target.kind === 'note' && l.target.sourceId)));
  const scoped = applicable.filter(l => exact.includes(l) ||
    !exact.some(span => l.start < span.end && span.start < l.end));
  const distinct=scoped.filter((link,i)=>!scoped.some((other,j)=>j!==i&&other.start===link.start&&other.end===link.end&&(
    other.target.kind!==link.target.kind||other.target.url!==link.target.url||other.target.number!==link.target.number||other.target.sourceId!==link.target.sourceId
  )));
  const individual=distinct.filter(link=>!Array.from(sources.values()).some(s=>
    link.target.kind==='note'&&link.target.sourceId&&!link.target.commentaryToken&&
    s.start<=link.start&&s.end>=link.end)).sort((a,b)=>a.start-b.start);
  // A title may itself cite a judgment or a provision. Keep the verified link at
  // those characters and use the bibliographic source for the rest of its span.
  const combined=[...individual];
  for(const source of sources.values()){
    let from=source.start;
    for(const link of individual){
      if(link.end<=from)continue;
      if(link.start>=source.end)break;
      if(from<link.start)combined.push({...source,start:from,end:link.start});
      from=Math.max(from,link.end);
    }
    if(from<source.end)combined.push({...source,start:from});
  }
  return combined;
}

export function useNoteLinks(session:Session,note?:{number:number;page:number;text:string}){
  const [state,setState]=useState<{number:number;text:string;links:InlineLink[]}>();
  const pages=React.useMemo(()=>{
    if(!note)return [];
    const printed=Object.entries(printedFootnotes).filter(([,rows])=>rows.includes(note.number)).map(([p])=>Number(p));
    return [...new Set([note.page,...printed])];
  },[note]);
  const initial=React.useMemo(()=>note?inlineLinks(note.text,note.number,pages.flatMap(p=>bundledPage(p).targets)):[],[note,pages]);
  useEffect(()=>{
    if(!note)return;
    let active=true;
    Promise.all(pages.map(p=>pageMap(session,p).catch(()=>bundledPage(p).targets))).then(results=>{
      if(active)setState({number:note.number,text:note.text,links:inlineLinks(note.text,note.number,results.flat())});
    });
    return()=>{active=false;};
  },[session,note,pages]);
  return note&&state?.number===note.number&&state.text===note.text?state.links:initial;
}
