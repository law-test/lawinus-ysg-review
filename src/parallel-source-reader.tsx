import React,{useEffect,useRef,useState} from 'react';
import PaneResizer from './pane-resizer';
import registry from './source-translations.json';
import {validateTranslation,translationPageAt,translationNoteText,type TranslationDocument,type TranslationEntry} from './translation-model';
import './parallel-source-reader.css';

export const translationEntries=registry.sources as TranslationEntry[];
const cache=new Map<string,Promise<TranslationDocument>>();
function loadTranslation(entry:TranslationEntry){
  let pending=cache.get(entry.file);
  if(!pending){pending=fetch(new URL('./translations/'+entry.file,document.baseURI),{credentials:'omit'}).then(async r=>{if(!r.ok)throw Error('번역을 불러오지 못했습니다.');return validateTranslation(await r.json(),entry);}).catch(e=>{cache.delete(entry.file);throw e;});cache.set(entry.file,pending);}
  return pending;
}
type Props={sourceId:string;page:number;onPageChange:(page:number)=>void;children?:React.ReactNode};
export default function ParallelSourceReader(props:Props){
  const entry=translationEntries.find(row=>row.sourceId===props.sourceId);
  if(!entry)return <div className="source-reader-single">{props.children}</div>;
  return <TranslationReader key={entry.sourceId} {...props} entry={entry}/>;
}
function TranslationReader({entry,page,onPageChange,children}:Props&{entry:TranslationEntry}){
  const [doc,setDoc]=useState<TranslationDocument|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [parallel,setParallel]=useState(true),[split,setSplit]=useState(52),[mobileView,setMobileView]=useState<'original'|'translation'>('original');
  const pair=useRef<HTMLDivElement>(null),scroll=useRef<HTMLDivElement>(null),fromTranslation=useRef<number|null>(null),programmaticTop=useRef<number|null>(null),raf=useRef(0);
  const latestPage=useRef(page);latestPage.current=page;
  const current=doc?.pages.find(row=>row.pdfPage===page);
  useEffect(()=>{let alive=true;setError('');loadTranslation(entry).then(d=>{if(alive)setDoc(d);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[entry,retry]);
  useEffect(()=>{
    if(fromTranslation.current===page){fromTranslation.current=null;return;}
    const el=scroll.current,target=el?.querySelector<HTMLElement>(`[data-translation-page="${page}"]`);
    if(!el||!target||el.clientHeight===0)return;
    const top=target.getBoundingClientRect().top-el.getBoundingClientRect().top+el.scrollTop;
    programmaticTop.current=Math.min(top,el.scrollHeight-el.clientHeight);el.scrollTo({top,behavior:'instant'});
  },[page,doc,parallel,mobileView]);
  useEffect(()=>()=>cancelAnimationFrame(raf.current),[]);
  useEffect(()=>{const el=scroll.current;if(!el||!doc)return;let width=0,height=0;
    const observer=new ResizeObserver(()=>{const shown=el.clientWidth>0&&el.clientHeight>0,changed=shown&&(width!==el.clientWidth||height===0);width=el.clientWidth;height=el.clientHeight;if(!changed)return;
      const target=el.querySelector<HTMLElement>(`[data-translation-page="${latestPage.current}"]`);if(target){const top=target.getBoundingClientRect().top-el.getBoundingClientRect().top+el.scrollTop;programmaticTop.current=Math.min(top,el.scrollHeight-el.clientHeight);el.scrollTop=top;}
    });observer.observe(el);return()=>observer.disconnect();
  },[doc,parallel]);
  function onScroll(){
    if(raf.current)return;
    raf.current=requestAnimationFrame(()=>{raf.current=0;const el=scroll.current;if(!el||el.clientHeight===0)return;
      const ownMove=programmaticTop.current;programmaticTop.current=null;if(ownMove!==null&&Math.abs(el.scrollTop-ownMove)<1)return;
      const box=el.getBoundingClientRect();const tops=Array.from(el.querySelectorAll<HTMLElement>('[data-translation-page]')).map(row=>({page:Number(row.dataset.translationPage),top:row.getBoundingClientRect().top-box.top+el.scrollTop}));
      const target=translationPageAt(tops,el.scrollTop+Math.min(100,el.clientHeight*.18));
      if(target!==page){fromTranslation.current=target;onPageChange(target);}
    });
  }
  const original=children||<div className="foreign-text-original" lang={entry.language}>{doc?.pages.map(p=><article key={p.pdfPage}>{p.blocks.map(b=><div key={b.id} className={'translated-block '+b.kind}>{b.kind==='heading'?<h3>{b.original}</h3>:<p>{b.original}</p>}</div>)}</article>)}</div>;
  return <div className="foreign-source-reader">
    {error&&<div className="translation-unavailable" role="alert"><p>{error}</p><button onClick={()=>setRetry(x=>x+1)}>다시 불러오기</button></div>}
    <div className="translation-controls"><div className="translation-document"><b>{entry.title}</b><span>{entry.language==='de'?'독일어':'영문'} 원전 · 한국어 번역 · {entry.scope}</span></div><div className="translation-mode"><button aria-pressed={!parallel} onClick={()=>setParallel(false)}>원전만</button><button aria-pressed={parallel} onClick={()=>setParallel(true)}>원전·번역</button></div></div>
    {parallel&&<div className="translation-mobile-tabs" aria-label="원전과 번역 전환"><button className={mobileView==='original'?'selected':''} aria-pressed={mobileView==='original'} onClick={()=>setMobileView('original')}>원전</button><button className={mobileView==='translation'?'selected':''} aria-pressed={mobileView==='translation'} onClick={()=>setMobileView('translation')}>한국어 번역</button></div>}
    <div className={`parallel-source ${parallel?'is-parallel':'original-only'} mobile-${mobileView}`} ref={pair} style={{'--original-width':split+'%'} as React.CSSProperties}>
      <div className="parallel-original" aria-label="외국 문헌 원전">{original}</div>
      {parallel&&<><PaneResizer className="translation-divider" label="원전과 번역 너비 조절" value={split} min={30} max={70} onChange={setSplit} unitsPerPixel={()=>100/(pair.current?.getBoundingClientRect().width||1)}/>
        <section className="translation-pane" aria-label="한국어 번역"><div className="translation-page-heading"><b>한국어 번역</b>{entry.kind==='pdf'&&<span>PDF {page}쪽 · {entry.totalPages}쪽</span>}<a href={'./translations/'+entry.file} download>번역 데이터 ↓</a></div>
          <div className="translation-scroll" ref={scroll} onScroll={onScroll}>
            {!doc?(!error&&<p>번역을 불러오는 중…</p>):doc.pages.map(p=><article key={p.pdfPage} data-translation-page={p.pdfPage} className={current?.pdfPage===p.pdfPage?'current-translation-page':''}>
              <h3 className="translation-sheet-label">{entry.kind==='pdf'?`원문 ${p.printedPage||p.pdfPage}면`:entry.scope}</h3>
              {p.blocks.map(block=><div className={'translated-block '+block.kind} key={block.id}>{block.kind==='heading'?<h3>{block.translation}</h3>:<p>{block.translation}</p>}{typeof block.translatorNote==='string'&&<aside className="translator-notes"><b>번역 주</b><p>{block.translatorNote}</p></aside>}</div>)}
              {!!p.translatorNotes?.length&&<aside className="translator-notes"><b>번역 주</b>{p.translatorNotes.map((n,i)=><p key={i}>{translationNoteText(n)}</p>)}</aside>}
            </article>)}
          </div>
        </section></>}
    </div>
  </div>;
}
