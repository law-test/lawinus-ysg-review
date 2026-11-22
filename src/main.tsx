import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import KuBrand from './ku-brand';
import {Catalog,Citation,Note,Session,ReaderError,automaticRetryMessage,visit,expiration,privateResource,readSession,storeSession} from './reader-api';
import {PageLayer,NoteText,useNoteLinks,useWorksRevision,copyManuscriptSelection,worksInNote,printedFootnotes,SourceHighlightScope,type PageTarget} from './page-text';
import ContentsSearch from './contents-search';
import {getPageImage} from './visible-page-cache';
import ReferencePages from './reference-pages';
import {extraCitationSources} from './printed-pages';
import {catalogCase} from './citation-links';
import CasePane from './case-pane';
import {casesInNote,caseOriginal,type CaseOriginal,type CasePart} from './footnote-cases';
import LawPane from './law-pane';
import {useSectionNavigation} from './section-navigation';
import {folioLabel,folioDescription,lastPrintedFolio,sheetForFolio} from './thesis-folios';
import './reader.css';
import {commentaryLocation} from './commentary-locations';
import {preserveReadingPosition} from './reading-position';

function Photo({session,query,label,active=true,onReady}:{session:Session;query:string;label:string;active?:boolean;onReady?:()=>void}){
  const [picture,setPicture]=useState<{query:string;url:string;token:string}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!active)return;
    const item=getPageImage(session,query);let alive=true;
    let image='',timer=0;
    setError('');
    item.promise.then(blob=>{
      if(!alive)return;
      image=URL.createObjectURL(blob);setPicture({query,url:image,token:session.token});
    }).catch(e=>{
      if(!alive)return;
      setError(e instanceof ReaderError?e.message:'열람 이미지를 불러오지 못했습니다.');
      if(e instanceof ReaderError&&e.status===429)timer=window.setTimeout(()=>setRetry(n=>n+1),e.wait*1000);
    });
    return()=>{alive=false;item.release();window.clearTimeout(timer);if(image)URL.revokeObjectURL(image);};
  },[session,query,active,retry]);
  if(!active)return null;
  if(error)return <div className="image-status" role="status">{error} <button onClick={()=>setRetry(n=>n+1)}>다시 시도</button></div>;
  return picture&&picture.token===session.token&&picture.query===query?<img src={picture.url} alt={label} draggable={false} onLoad={onReady}/>:<div className="image-status" role="status">쪽을 불러오는 중…</div>;
}

function DocumentPane({session,start,count,notes,onPage,onTarget,compactFolio,folioNotice}:{compactFolio:React.ReactNode;folioNotice:React.ReactNode;session:Session;start:number;count:number;notes:Note[];onPage:(page:number)=>void;onTarget:(t:PageTarget,page:number)=>void}){
  const host=useRef<HTMLDivElement>(null);
  const [visible,setVisible]=useState<number[]>([start]);
  const [reading,setReading]=useState<number[]>([start]);
  const [zoom,setZoom]=useState(100);
  const positions=useMemo(()=>Array.from({length:count},(_,i)=>i+1),[count]);
  const noteMap=useMemo(()=>{const map=new Map<number,Note[]>();for(const n of notes){const row=map.get(n.page)||[];row.push(n);map.set(n.page,row);}return map;},[notes]);
  useLayoutEffect(()=>{
    const scroll=host.current!;
    const items=Array.from(scroll.querySelectorAll<HTMLElement>('.paper-page'));
    const last=items[items.length-1];
    // Short pages still need enough space below them to reach the top of the viewport.
    const sizeEndMargin=()=>scroll.style.setProperty('--last-page-room',Math.max(0,scroll.clientHeight-last.offsetHeight)+'px');
    const pageSize=new ResizeObserver(sizeEndMargin);
    pageSize.observe(scroll);
    pageSize.observe(last);
    sizeEndMargin();
    const jump=(page:number)=>{const item=items[Math.max(0,Math.min(count-1,page-1))];if(item){scroll.scrollTop=item.offsetTop;scroll.dispatchEvent(new Event('reader:position-changed'));onPage(Number(item.dataset.page));}};
    const navigate=(event:Event)=>{const page=Number((event as CustomEvent).detail?.page);if(Number.isInteger(page))jump(page);};
    const update=()=>{
      const top=scroll.scrollTop+Math.min(120,scroll.clientHeight*.18);
      let lo=0,hi=items.length-1;
      while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(items[mid].offsetTop<=top)lo=mid;else hi=mid-1;}
      onPage(lo+1);
    };
    const observer=new IntersectionObserver(entries=>{
      setVisible(prev=>{const next=new Set(prev);for(const entry of entries){const page=Number((entry.target as HTMLElement).dataset.page);if(entry.isIntersecting)next.add(page);else next.delete(page);}return [...next];});
    },{root:scroll,rootMargin:'80% 0px'});
    const textObserver=new IntersectionObserver(entries=>{
      setReading(prev=>{const next=new Set(prev);for(const entry of entries){const page=Number((entry.target as HTMLElement).dataset.page);if(entry.isIntersecting)next.add(page);else next.delete(page);}return [...next];});
    },{root:scroll});
    for(const item of items){observer.observe(item);textObserver.observe(item);}
    const readingPosition=preserveReadingPosition(scroll,'.paper-page',()=>0,update);
    jump(start);scroll.addEventListener('scroll',update,{passive:true});window.addEventListener('paper:navigate',navigate);
    return()=>{readingPosition.disconnect();observer.disconnect();textObserver.disconnect();pageSize.disconnect();scroll.removeEventListener('scroll',update);window.removeEventListener('paper:navigate',navigate);};
  },[count,start,onPage]);
  const sections=useSectionNavigation(host,start,onPage);
  return <main className="manuscript-pane" data-native-text="true" aria-label="논문 본문"><div className="paper-actions"><strong>논문</strong><div className="paper-menu-tools">{compactFolio}</div><button type="button" className="section-back" hidden={!sections.canReturn} aria-label="이전 읽던 위치로 돌아가기" title="이전 읽던 위치로 돌아가기" onClick={sections.back}>←</button><label>확대 <select value={zoom} onChange={e=>setZoom(Number(e.target.value))}>{[85,100,125,150,200].map(v=><option key={v} value={v}>{v}%</option>)}</select></label></div>
    {folioNotice}
    <div className="paper-scroll" ref={host} onCopy={copyManuscriptSelection} tabIndex={0} aria-label="논문 연속 스크롤">{positions.map(page=><article className="paper-page" key={page} data-page={page} data-folio={folioLabel(page)} data-folio-description={folioDescription(page)} style={{width:zoom+'%'}} tabIndex={-1} aria-label={sections.heading?.page===page&&sections.heading.title?sections.heading.title:'논문 '+folioDescription(page)}>
      <Photo session={session} label={'논문 '+folioDescription(page)} query={'edition=ysg-20261121&page='+page} active={visible.includes(page)}/>
      {sections.heading?.page===page&&<span key={sections.heading.y} className="section-destination" style={{top:sections.heading.y*100+'%'}} aria-hidden="true"/>}
      {visible.includes(page)&&<PageLayer session={session} textAllowed={reading.includes(page)} query={'metadata=page&page='+page} label={'논문 '+folioDescription(page)+' 글자'}
        fallback={(noteMap.get(page)||[]).flatMap(n=>(n.markers||[]).map(m=>({...m,kind:'note' as const,number:n.number,label:'각주 '+n.number})))}
        onTarget={t=>onTarget(t,page)}/>}
    </article>)}</div></main>;
}

function Workspace({session,catalog,notes:originalNotes}:{session:Session;catalog:Catalog;notes:Note[]}){
  const initial=Math.max(1,Math.min(catalog.bodyStartPage||1,catalog.pageCount));
  const [legal,setLegal]=useState<PageTarget|null>(null);
  const [caseTarget,setCaseTarget]=useState<PageTarget|null>(null);
  const [referenceFocus,setReferenceFocus]=useState(0);
  const [folioError,setFolioError]=useState('');
  const [menusCollapsed,setMenusCollapsed]=useState(false);
  useLayoutEffect(()=>{
    const syncMenu=()=>setMenusCollapsed(document.getElementById('reading-menus')?.inert===true);
    window.addEventListener('paper:menu-visibility',syncMenu);
    syncMenu();
    return ()=>window.removeEventListener('paper:menu-visibility',syncMenu);
  },[]);
  const [page,setPage]=useState(initial),[pageInput,setPageInput]=useState(folioLabel(initial)),[toc,setToc]=useState(false),[query,setQuery]=useState(''),[list,setList]=useState(false),[own,setOwn]=useState<{page:number;number?:number;id?:string;group?:string;sourcePage?:number;showNote?:boolean;noteOnly?:boolean;citationTitle?:string;unavailableCitation?:string}|null>(()=>{const id=new URLSearchParams(location.search).get('source');return id&&catalog.sources.some(s=>s.id===id)?{page:initial,id}:null;});
  const sources=useMemo(()=>new Map(catalog.sources.map(s=>[s.id,s])),[catalog]);
  const notes=useMemo(()=>originalNotes.map(original=>{
    const note={...original,sources:original.sources.map(source=>{const location=commentaryLocation(source.id,original.number);return location?{...source,page:location.position}:source;})};
    const additions=extraCitationSources(note.number).filter(c=>sources.has(c.id)&&!note.sources.some(source=>source.id===c.id));
    return additions.length?{...note,sources:[...note.sources,...additions]}:note;
  }),[originalNotes,sources]);
  const chosen=own;
  const referencePage=chosen?.page??page;
  const pageNotes=useMemo(()=>{const printed=new Set(printedFootnotes[referencePage]);return notes.filter(n=>n.page===referencePage||printed.has(n.number));},[notes,referencePage]);
  const worksRevision=useWorksRevision();
  const options=useMemo(()=>pageNotes.flatMap(note=>{
    type Option={note:Note;citation:Citation;value:string;title:string;group?:string;sourcePage?:number};
    const result:Option[]=[];
    const seen=new Set<string>();
    for(const work of worksInNote(note.number)){
      const source=work.sourceId&&sources.get(work.sourceId);
      if(!source)continue;
      const citation=note.sources.find(c=>c.id===source.id)??{id:source.id};
      const value=note.number+'/'+source.id+(seen.has(source.id)?'/'+work.id:'');
      const quoted=note.text.slice(work.noteStart,work.noteEnd);
      const folio=quoted.match(/\d+(?:\s*[~～–-]\s*\d+)?(?:\s*[·,]\s*\d+(?:\s*[~～–-]\s*\d+)?)*\s*면/u)?.[0];
      result.push({note,citation,value,title:work.label+(folio?' · '+folio.trim():''),group:work.id,sourcePage:work.sourcePage});
      seen.add(source.id);
    }
    for(const citation of note.sources){
      const source=sources.get(citation.id);
      if(source&&!seen.has(source.id))result.push({note,citation,value:note.number+'/'+source.id,title:source.title});
    }
    return result;
  }),[pageNotes,sources,worksRevision]);
  const entry=chosen?options.find(item=>item.note.number===chosen.number&&
    (chosen.group?item.group===chosen.group:item.citation.id===chosen.id)):options[0];
  const preview=chosen?.sourcePage??entry?.sourcePage;
  const sourceId=chosen?.id||entry?.citation.id;
  const selectedNote=entry?.note||notes.find(n=>chosen?.number===n.number);
  const noteLinks=useNoteLinks(session,selectedNote);
  const citation:Citation|undefined=entry?.citation||selectedNote?.sources.find(s=>s.id===sourceId);
  const source=sourceId?sources.get(sourceId):null;
  const previews=citation?.previewPages?.length?citation.previewPages:citation?.image&&citation.page?[citation.page]:[];
  const previewPage=preview??previews[0]??(source?.format==='text'?citation?.page:undefined)??(source?.pageCount?1:undefined);
  const listedCase=!previewPage?catalogCase(sourceId):undefined;
  const focusListedCase=Boolean(!chosen?.noteOnly&&listedCase&&(!chosen?.showNote||selectedNote?.sources.length===1));
  const sourceScroll=useRef<HTMLElement>(null);
  const noteDetail=useRef<HTMLDetailsElement>(null);
  const focusEvidence=useCallback(()=>{
    if(chosen?.showNote||previewPage)return;
    const pane=sourceScroll.current;if(!pane)return;
    const mark=pane.querySelector<HTMLElement>('.source-image mark,blockquote mark');
    if(!mark)return;
    const heading=pane.querySelector('h2')?.getBoundingClientRect().height||0;
    const goal=mark.getBoundingClientRect().top-pane.getBoundingClientRect().top+pane.scrollTop-heading-24;
    pane.scrollTop=Math.max(0,goal);
  },[chosen?.showNote,previewPage]);
  useLayoutEffect(()=>{
    if(previewPage||focusListedCase)return;
    const pane=sourceScroll.current;if(!pane)return;
    pane.scrollTop=0;
    const img=pane.querySelector<HTMLImageElement>('.source-image img');
    if(!img||img.complete&&img.naturalWidth>0)focusEvidence();
  },[sourceId,selectedNote?.number,previewPage,focusEvidence,focusListedCase]);
  useLayoutEffect(()=>{
    if(focusListedCase||!chosen?.showNote||!noteDetail.current||!sourceScroll.current||list)return;
    noteDetail.current.open=true;
    if(previewPage)return;
    sourceScroll.current.scrollTop=0;
    if(window.matchMedia('(max-width:760px)').matches){
      const pane=sourceScroll.current, bounds=pane.getBoundingClientRect();
      const note=noteDetail.current.getBoundingClientRect();
      if(note.bottom>bounds.bottom)pane.scrollTop=Math.max(0,note.top-bounds.top-4);
      if(bounds.bottom<0||bounds.top>=window.innerHeight)pane.scrollIntoView({block:'center'});
    }
  },[chosen,list,previewPage,focusListedCase]);
  const readingPage=useRef(initial);
  const change=useCallback((p:number)=>{if(readingPage.current===p)return;readingPage.current=p;setPage(p);setPageInput(folioLabel(p));setFolioError('');setOwn(previous=>previous?.page===p?previous:null);},[]);
  useEffect(()=>{window.dispatchEvent(new CustomEvent('paper:page',{detail:{page}}));},[page]);
  const jump=(p:number)=>window.dispatchEvent(new CustomEvent('paper:navigate',{detail:{page:Math.max(1,Math.min(p,catalog.pageCount))}}));
  const caseNote=caseTarget?.noteNumber;
  const companionCases=casesInNote(caseNote);
  const displayedNumber=caseTarget?.caseNumber||caseTarget?.label;
  const selectedCaseOption=displayedNumber?options.find(o=>(!caseNote||o.note.number===caseNote)&&
    (catalogCase(o.citation.id)===displayedNumber||caseOriginal(displayedNumber)?.sourceId===o.citation.id)):undefined;
  const shownOption=caseTarget?selectedCaseOption:(chosen?.noteOnly?undefined:entry);
  function openCase(number:string,noteNumber?:number){
    setReferenceFocus(v=>v+1);
    setLegal(null);
    setList(false);
    setCaseTarget({kind:'case',caseNumber:number,noteNumber,x:0,y:0,w:0,h:0});
  }
  function openNote(n:Note,where:number,sourceId?:string,sourcePage?:number,citationTitle?:string,group?:string){
    setList(false);
    setOwn({page:where,number:n.number,id:sourceId||n.sources[0]?.id,showNote:true,citationTitle,group,sourcePage});
    const first=casesInNote(n.number)[0];
    if(first&&!sourceId){openCase(first,n.number);return;}
    setReferenceFocus(v=>v+1);setLegal(null);setCaseTarget(null);
  }
  function returnToNote(){
    const note=notes.find(n=>n.number===caseNote);
    setCaseTarget(null);
    if(!note)return;
    setList(false);
    setOwn({page:referencePage,number:note.number,id:note.sources[0]?.id,showNote:true,noteOnly:true});
  }
  const chooseNote=(n:Note)=>openNote(n,referencePage);
  function targetAction(t:PageTarget,fromPage:number){
    if(t.kind==='section'){
      window.dispatchEvent(new CustomEvent('paper:section',{detail:{fromPage,page:t.targetPage,y:t.targetY,title:t.title}}));
      return;
    }
    if(t.kind==='case'){
      if(t.noteNumber){
        const n=notes.find(note=>note.number===t.noteNumber);
        if(n){setOwn({page:fromPage,number:n.number,id:n.sources[0]?.id,showNote:true});}
      }
      setReferenceFocus(v=>v+1);setLegal(null);setCaseTarget(t);setList(false);return;
    }
    if(t.kind==='law'){setCaseTarget(null);setLegal(t);setList(false);return;}
    setLegal(null);setCaseTarget(null);
    const n=notes.find(item=>item.number===t.number);
    if(!n){
      if(t.sourceId&&sources.has(t.sourceId)){
        setReferenceFocus(v=>v+1);setList(false);setOwn({page:fromPage,id:t.sourceId,sourcePage:t.sourcePage,group:t.sourceGroup,citationTitle:t.title});
      }
      return;
    }
    const dest=t.kind==='cross'?(t.targetPage||n.page):fromPage;
    if(t.kind==='cross')jump(dest);
    const explicit=t.sourceId&&sources.has(t.sourceId)?t.sourceId:undefined;
    if(t.sourceGroup&&!explicit){
      setList(false);setOwn({page:dest,number:n.number,showNote:true,noteOnly:true,group:t.sourceGroup,unavailableCitation:t.title});
      return;
    }
    openNote(n,dest,explicit,explicit?t.sourcePage:undefined,t.sourceGroup?t.title:undefined,t.sourceGroup);
  }
  const chooseSource=(id:string)=>{const n=pageNotes.find(n=>n.sources.some(c=>c.id===id))||notes.find(n=>n.sources.some(c=>c.id===id));setReferenceFocus(v=>v+1);setLegal(null);setCaseTarget(null);setList(false);setOwn({page:referencePage,number:n?.number,id});};
  const renderCasePages=(id:string,original?:CaseOriginal,part:CasePart='order',focusKey?:string)=>(
    <ReferencePages key={id} session={session} sourceId={id} initialPage={1} focusCitation={true}
      caseOriginal={original} casePart={part} focusKey={focusKey}
      renderPage={(p,canonicalId,onReady)=><Photo session={session} label={'판결문 PDF '+p+'쪽'}
        query={new URLSearchParams({source:canonicalId,page:String(p)}).toString()} onReady={onReady}/>}/>
  );
  const folioForm=(<form className="folio-jump" onSubmit={e=>{
        e.preventDefault();
        const sheet=sheetForFolio(pageInput);
        if(sheet===undefined){setFolioError('표지·로마자 목차 쪽 또는 1–'+lastPrintedFolio+'쪽을 입력하세요.');return;}
        setFolioError('');setPageInput(folioLabel(sheet));jump(sheet);
      }}><label>인쇄 쪽 <input aria-label="논문 인쇄 쪽" aria-invalid={Boolean(folioError)} aria-describedby={folioError?'folio-error':undefined}
        value={pageInput} onChange={e=>{setPageInput(e.target.value);setFolioError('');}} autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="go"/></label>
        {!menusCollapsed&&<span>/ {lastPrintedFolio}쪽</span>}<button>이동</button></form>);
  const folioNotice=folioError&&<small id="folio-error" role="status">{folioError}</small>;
  return <div className="examiner-app"><div id="reading-menus" className="reading-menus"><div className="reading-menus-content"><header className="examiner-header"><KuBrand/><div className="paper-heading"><small>박사학위논문 · {catalog.author}</small><h1>{catalog.title}</h1>{catalog.subtitle&&<p>{catalog.subtitle}</p>}</div><nav><span className="reader-tools-slot"/><button type="button" onClick={()=>setToc(v=>!v)} aria-expanded={toc}>목차·검색</button><button type="button" onClick={()=>{setLegal(null);setCaseTarget(null);setList(v=>!v);}} aria-expanded={list}>참고문헌</button><details className="edition-menu"><summary>편집·이전판</summary><div className="edition-menu-options"><a href="/review/">본문·각주 수정</a><a href="/editions/20261024/">10.24 제출본</a><a href="/editions/20261023/">10.23 제출본</a></div></details></nav></header>
    <section className="page-controls" data-current-sheet={page}><button disabled={page===1} onClick={()=>jump(page-1)}>이전</button>{!menusCollapsed&&folioForm}<button disabled={page===catalog.pageCount} onClick={()=>jump(page+1)}>다음</button>{!menusCollapsed&&folioNotice}</section>
    </div></div>
    <div className="reader-layout">{toc&&<ContentsSearch session={session} catalog={catalog} notes={catalog.searchEnabled===true?notes:pageNotes} go={(p,n)=>{setToc(false);jump(p);if(n)openNote(n,p);}}/>}
      <SourceHighlightScope><DocumentPane session={session} start={initial} count={catalog.pageCount} notes={notes} onPage={change} onTarget={targetAction}
        compactFolio={menusCollapsed&&folioForm} folioNotice={menusCollapsed&&folioNotice}/></SourceHighlightScope>
      <aside className="reference-pane" aria-label="참고문헌"><div className="reference-toolbar"><strong>참고문헌·원전</strong><div>{options.length>0&&<select aria-label="이 쪽의 인용자료" value={shownOption?.value??''} onChange={e=>{
          const opt=options.find(o=>o.value===e.target.value);
          if(!opt)return;
          setLegal(null);setList(false);
          setOwn({page:referencePage,number:opt.note.number,id:opt.citation.id,group:opt.group,sourcePage:opt.sourcePage});
          const number=catalogCase(opt.citation.id)||casesInNote(opt.note.number).find(id=>caseOriginal(id)?.sourceId===opt.citation.id);
          if(number)openCase(number,opt.note.number);else{setCaseTarget(null);setReferenceFocus(v=>v+1);}
        }}><option value="" disabled>{chosen?.noteOnly&&!caseTarget?'각주 원문 · 인용자료 선택':'이 쪽의 인용자료'}</option>{options.map(o=><option key={o.value} value={o.value} data-source-group={o.group}>각주 {o.note.number} · {o.title}</option>)}</select>}
        <button onClick={()=>{setLegal(null);setCaseTarget(null);setList(v=>!v);setOwn(null);}}>{list?'본문 따라가기':'자료 목록'}</button></div></div>
      {legal?<LawPane session={session} target={legal} onClose={()=>setLegal(null)}/>:caseTarget?<CasePane session={session} target={caseTarget} onClose={returnToNote} focusKey={referenceFocus} renderReference={renderCasePages}
        navigation={<>
          {companionCases.length<=1&&<strong className="current-case-number">{displayedNumber}</strong>}
          {companionCases.length>1&&<select aria-label="이 각주의 인용 판례" value={caseTarget.caseNumber||caseTarget.label||''} onChange={e=>openCase(e.target.value,caseNote)}>
            {companionCases.map(number=><option key={number} value={number}>{number}</option>)}
          </select>}
          {caseNote&&<button className="case-note-text" aria-label={'각주 '+caseNote+' 원문 보기'} onClick={returnToNote}>각주 {caseNote} 원문</button>}
        </>}/>:list?<section className="source-library"><h2>자료 목록</h2><label>자료 검색<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>{catalog.sources.filter(s=>s.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(s=><button key={s.id} onClick={()=>chooseSource(s.id)}>{s.title}</button>)}</section>:
      <section className={'source-dialog'+(chosen?.showNote?' showing-note':'')} ref={sourceScroll}><h2 data-source-group={entry?.group} data-source-id={sourceId}>{chosen?.citationTitle||(entry?.group?entry.title:undefined)||source?.title||(selectedNote?'각주 '+selectedNote.number:'이 쪽의 인용자료')}</h2>
        {chosen?.unavailableCitation&&<p role="status">{chosen.unavailableCitation} · 연결된 원문이 없어 인용 각주를 표시합니다.</p>}
        {selectedNote&&<details ref={noteDetail} key={selectedNote.number} open={chosen?.showNote||(!previewPage&&!citation?.excerpt)}><summary>각주 {selectedNote.number} 원문</summary><p><NoteText text={selectedNote.text} links={noteLinks} onTarget={t=>targetAction(t,referencePage)}/></p></details>}
        {citation?.label&&citation.label!==source?.title&&<p className="citation-location">{citation.label}</p>}
        {citation?.excerpt&&<blockquote>{citation.verified?<mark>{citation.excerpt}</mark>:citation.excerpt}</blockquote>}
        {listedCase&&!chosen?.noteOnly&&<CasePane session={session} number={listedCase} focusKey={referenceFocus} focusJudgment={focusListedCase} renderReference={renderCasePages}/>}
        {(previewPage||source?.format==='text')&&sourceId&&!chosen?.noteOnly&&<ReferencePages key={sourceId} session={session} sourceId={sourceId} onLawTarget={t=>{setCaseTarget(null);setLegal(t);setList(false);}} initialPage={previewPage||1} explicitPage={preview} noteNumber={selectedNote?.number} citationPages={previews} highlightPage={citation?.page} highlights={citation?.highlights} focusCitation={true} focusKey={selectedNote?.number+'/'+previewPage+'/'+referenceFocus} renderPage={(p,canonicalId,onReady)=><Photo session={session} label={'참고문헌 PDF '+p+'쪽'} query={new URLSearchParams({source:canonicalId,page:String(p)}).toString()} onReady={onReady}/>}/>}
        {!source&&!selectedNote&&<p>이 쪽에 연결된 인용자료가 없습니다.</p>}
        {source&&source.format!=='text'&&!listedCase&&(!citation||(!citation.excerpt&&!previewPage))&&<p>현재 자료의 서지와 연결 각주를 표시합니다.</p>}
      </section>}
      {!legal&&!caseTarget&&!list&&pageNotes.length>0&&<div className="note-list" aria-label="이 쪽의 각주">{pageNotes.map(n=><button key={n.number} onClick={()=>chooseNote(n)} aria-pressed={selectedNote?.number===n.number}>각주 {n.number}</button>)}</div>}
    </aside></div></div>;
}

function ReadingSession({session}:{session:Session}){
  const [data,setData]=useState<{catalog:Catalog;notes:Note[]}|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const [waiting,setWaiting]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    let retryTimer=0,catalog:Catalog|undefined;
    async function open(){
      setError('');setWaiting(false);
      try{
        const metadata=async(key:string)=>(await privateResource(session,new URLSearchParams({metadata:key}),controller.signal)).json();
        catalog??=await metadata('catalog') as Catalog;
        const citations=await metadata('citations');
        if(!controller.signal.aborted)setData({catalog,notes:citations.notes});
      }catch(e){
        if(controller.signal.aborted)return;
        if(e instanceof ReaderError&&e.status===429){
          setWaiting(true);setError(automaticRetryMessage(e));
          retryTimer=window.setTimeout(open,e.wait*1000);
        }else setError(e instanceof Error?e.message:'논문을 불러오지 못했습니다.');
      }
    }
    void open();
    return()=>{clearTimeout(retryTimer);controller.abort();};
  },[session,attempt]);
  if(!data)return <Loading error={error} waiting={waiting} retry={()=>setAttempt(a=>a+1)}/>;
  return <Workspace session={session} catalog={data.catalog} notes={data.notes}/>;
}

function Loading({error,retry,waiting=false}:{error:string;retry:()=>void;waiting?:boolean}){
  return <div className="examiner-app"><header className="examiner-header"><KuBrand/><div className="paper-heading"><small>박사학위논문 · 여성곤</small><h1>민사신탁의 법리에 관한 연구</h1></div></header><section className="page-controls">인쇄 1 / {lastPrintedFolio}쪽</section><div className="reader-layout"><main className="reader-pending"><strong>논문</strong><p role="status">{error||'논문을 불러오는 중…'}</p>{error&&!waiting&&<button onClick={retry}>다시 시도</button>}</main><aside className="reference-pane"><div className="reference-toolbar"><strong>참고문헌·원전</strong></div></aside></div></div>;
}

function App(){
  const [session,setSession]=useState<Session|null>(readSession);
  const [error,setError]=useState(''),[waiting,setWaiting]=useState(false);
  const pending=useRef<Promise<void>|null>(null), retryTimer=useRef<number>(0);
  const refresh=useCallback(()=>{
    if(pending.current)return;
    clearTimeout(retryTimer.current);
    setError('');setWaiting(false);
    pending.current=visit().then(s=>{storeSession(s);setSession(s);}).catch(e=>{
      const wait=e instanceof ReaderError&&e.status===429?e.wait:12;
      const limited=e instanceof ReaderError&&e.status===429;
      setWaiting(limited);setError(limited?automaticRetryMessage(e):e instanceof ReaderError?e.message:'열람 연결을 시작하지 못했습니다.');
      retryTimer.current=window.setTimeout(refresh,wait*1000);
    }).finally(()=>{pending.current=null;});
  },[]);
  useEffect(()=>{
    if(!session)refresh();
    const timer=session?window.setTimeout(refresh,Math.max(0,expiration(session.expiresAt)-Date.now()-30000)):0;
    window.addEventListener('paper:expired',refresh);
    return()=>{window.clearTimeout(timer);window.removeEventListener('paper:expired',refresh);};
  },[session,refresh]);
  useEffect(()=>()=>clearTimeout(retryTimer.current),[]);
  return session?<ReadingSession session={session}/>:<Loading error={error} waiting={waiting} retry={refresh}/>;
}
if(location.protocol!=='http:'||location.hostname!=='ysg.lawinus.org')createRoot(document.getElementById('root')!).render(<App/>);
