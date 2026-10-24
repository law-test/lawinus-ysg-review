import React,{useEffect,useRef,useState} from 'react';
import type {SharedEdit} from './shared-edits';
import './web-manuscript.css';
import {proposalLabel,type ProposalIndicator} from './proposal-indicators';
import './proposal-indicators.css';

export type ManuscriptParagraph={id:string;text:string;page:number;printed:string|number|null;kind:string;heading:boolean;order:number;rects:{page:number;rect:number[]}[]};
type Note={id:string;number:number;page:number;text:string};
export function manuscriptModeAfterRefresh(current:'pdf'|'body',userChoseView:boolean,overrideCount:number):'pdf'|'body'{
  return !userChoseView&&overrideCount>0?'body':current;
}
export function citationContextWasEdited(noteId:string,paragraphs:Pick<ManuscriptParagraph,'id'|'text'>[],overrides:Record<string,unknown>):boolean{
  const marker=`[^${Number(noteId.slice(3))}]`;
  return !!overrides[noteId]||paragraphs.some(p=>!!overrides[p.id]&&p.text.includes(marker));
}
export function InlineNoteText({text,onNote}:{text:string;onNote:(id:string)=>void}){
  return <>{text.split(/(\[\^\d+\])/g).map((part,i)=>/^\[\^\d+\]$/.test(part)?<button key={i} className="manuscript-note-marker" title="클릭하면 이동" onClick={e=>{e.stopPropagation();onNote('fn-'+part.slice(2,-1).padStart(3,'0'));}}>{part.slice(2,-1)})</button>:part)}</>;
}

export default function WebManuscript({paragraphs,overrides,notes,page,zoom,selected,onPageChange,onParagraph,onNote,proposalIndicators={},onProposal}:{paragraphs:ManuscriptParagraph[];overrides:Record<string,SharedEdit>;notes:Note[];page:number;zoom:number;selected:string;onPageChange:(page:number)=>void;onParagraph:(id:string)=>void;onNote:(id:string)=>void;proposalIndicators?:Record<string,ProposalIndicator>;onProposal?:(proposalId:string)=>void}){
  const host=useRef<HTMLDivElement>(null),lastReported=useRef<number|null>(null),drag=useRef<{x:number;y:number;top:number;moved:boolean}|null>(null),suppressClick=useRef(false);
  const [hand,setHand]=useState(true);
  const groups=new Map<number,ManuscriptParagraph[]>();
  for(const p of paragraphs){const group=groups.get(p.page)||[];group.push(p);groups.set(p.page,group);}
  useEffect(()=>{if(lastReported.current===page)return;const root=host.current;if(!root)return;const all=Array.from(root.querySelectorAll<HTMLElement>('[data-manuscript-page]'));const target=all.find(e=>Number(e.dataset.manuscriptPage)>=page)||all.at(-1);if(target)root.scrollTop+=target.getBoundingClientRect().top-root.getBoundingClientRect().top;},[page]);
  useEffect(()=>{const cancel=()=>{drag.current=null;suppressClick.current=false;};window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',cancel);return()=>{window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',cancel);};},[]);
  function reportPage(){const root=host.current;if(!root)return;const top=root.getBoundingClientRect().top;const blocks=Array.from(root.querySelectorAll<HTMLElement>('[data-manuscript-page]'));const visible=blocks.find(e=>e.getBoundingClientRect().bottom>top+70);if(visible){const n=Number(visible.dataset.manuscriptPage);lastReported.current=n;onPageChange(n);}}
  return <div className="web-manuscript-reader"><div className="manuscript-tools"><span>본문</span><button className={hand?'selected':''} onClick={()=>setHand(true)}>✋ 이동</button><button className={!hand?'selected':''} onClick={()=>setHand(false)}>글자 선택</button></div>
    <div className={'web-manuscript'+(hand?' hand-mode':'')} ref={host} onScroll={reportPage} style={{'--manuscript-zoom':zoom} as React.CSSProperties}
      onPointerDown={e=>{suppressClick.current=false;if(!hand||e.pointerType==='touch'||e.button!==0||(e.target as HTMLElement).closest('button'))return;drag.current={x:e.clientX,y:e.clientY,top:e.currentTarget.scrollTop,moved:false};}}
      onPointerMove={e=>{const d=drag.current;if(!d)return;if(!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)>5){d.moved=true;e.currentTarget.setPointerCapture(e.pointerId);}if(d.moved){e.currentTarget.scrollTop=d.top-(e.clientY-d.y);e.preventDefault();}}}
      onPointerUp={e=>{suppressClick.current=!!drag.current?.moved;drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
      onPointerCancel={()=>{suppressClick.current=!!drag.current?.moved;drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}
      onClickCapture={e=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();suppressClick.current=false;}}}>
      {Array.from(groups).map(([n,items])=><section className="manuscript-page" key={n} data-manuscript-page={n}><div className="manuscript-page-label">PDF {n}쪽{items[0].printed?` · 본문 ${items[0].printed}면`:''}</div>
        {items.map(p=>{const indicator=proposalIndicators[p.id],deleted=!!overrides[p.id]&&overrides[p.id].text.trim()==='';const open=()=>indicator&&onProposal?onProposal(indicator.primaryProposalId):onParagraph(p.id);return <div key={p.id} hidden={deleted&&!indicator} data-paragraph={p.id} className={'manuscript-paragraph'+(p.heading?' manuscript-heading':'')+(p.kind==='table_row'?' manuscript-table-row':'')+(selected===p.id?' active':'')+(overrides[p.id]?' amended':'')+(indicator?' has-proposal proposal-'+indicator.tone:'')} role="button" tabIndex={0} title="클릭하면 수정안" aria-label={(indicator?proposalLabel(indicator)+' · ':'')+'문단 수정안 열기: '+(overrides[p.id]?.text??p.text).replace(/\[\^\d+\]/g,'').slice(0,55)} onClick={()=>{if(window.getSelection()?.isCollapsed===false)return;open();}} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();open();}}}>
          {indicator&&<span className="manuscript-proposal-label"><button className={'proposal-badge proposal-'+indicator.tone} onClick={e=>{e.stopPropagation();open();}}>{proposalLabel(indicator)}</button></span>}
          {deleted?<span className="manuscript-deleted-label">현재 본문에서 삭제된 문단</span>:<InlineNoteText text={overrides[p.id]?.text??p.text} onNote={onNote}/>}
        </div>;})}
        {notes.some(note=>note.page===n)&&<div className="manuscript-footnotes">{notes.filter(note=>note.page===n).map(note=><button key={note.id} hidden={!!overrides[note.id]&&overrides[note.id].text.trim()===''} className="manuscript-footnote" title="클릭하면 이동" onClick={()=>onNote(note.id)}><sup>{note.number})</sup> {overrides[note.id]?.text??note.text}</button>)}</div>}
      </section>)}
    </div>
  </div>;
}
