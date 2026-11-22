import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ReaderError,automaticRetryMessage,type Session} from './reader-api';
import {pageCache} from './visible-page-cache';
import {officialURL,type PageTarget} from './page-text';
import {caseDestination} from './citation-links';
import {caseOriginal,type CaseOriginal,type CasePart} from './footnote-cases';
import supplementalCases from './footnote-originals.json';
import './case-pane.css';

export type CaseRecord={caseNumber:string;title:string;header?:string;sourceLabel?:string;scope?:string;officialUrl?:string;available:boolean;format?:'text'|'pages';content?:{heading:boolean;text:string}[];sourceId?:string;message?:string;notice?:string};
type Block={heading:boolean;text:string;part?:CasePart};
const readCase=pageCache<CaseRecord>(24,3*1024*1024,async response=>{
  const data=await response.json() as CaseRecord;
  if(!data.caseNumber||typeof data.available!=='boolean')throw Error('판례 정보를 확인하지 못했습니다.');
  if(data.available&&data.format==='text'&&!Array.isArray(data.content))throw Error('판결문을 확인하지 못했습니다.');
  return data;
},r=>r.content?.reduce((size,b)=>size+b.text.length*2+64,512)??512);

function judgmentBlocks(content:NonNullable<CaseRecord['content']>):Block[]{
  return content.flatMap(block=>{
    // Some court transcriptions put the heading and numbered grounds in one text node.
    const pieces=block.text.split(/(【\s*주\s*문\s*】|【\s*이\s*유\s*】|^\s*이\s*유(?=\s*\d+\.))/u);
    return pieces.filter(text=>text.length>0).map(text=>{
      const label=text.replace(/[【】\s]/gu,'');
      const part=label==='주문'?'order':label==='이유'?'reasons':undefined;
      return {text,heading:Boolean(part)||block.heading,part};
    });
  });
}
function originalParagraph(text:string){
  const groups=text.split(/(?<!\S)(?=(?:[1-9]\d*|[가-하])\.\u00a0)/u);
  return groups.length===1?text:groups.map((group,index)=><span className="case-paragraph-line" key={index}>{group}</span>);
}
const localCases=new Map(Object.entries(supplementalCases) as [string,CaseRecord][]);

export default function CasePane({session,target,number:catalogNumber,onClose,navigation,renderReference,focusKey=0,focusJudgment=true}:{
  session:Session;target?:PageTarget;number?:string;onClose?:()=>void;navigation?:React.ReactNode;
  renderReference?:(sourceId:string,original?:CaseOriginal,part?:CasePart,focusKey?:string)=>React.ReactNode;focusKey?:number;focusJudgment?:boolean
}){
  const number=catalogNumber||target?.caseNumber||(target?.label||target?.title||'').match(/\d{2,4}[가-힣]{1,5}\d{1,8}/)?.[0]||'';
  const [loaded,setRecord]=useState<CaseRecord|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const [waiting,setWaiting]=useState(false);
  const [jump,setJump]=useState<{number:string;key:number;part:CasePart;sequence:number}>();
  const requested=jump?.number===number&&jump.key===focusKey?jump:undefined;
  const part=requested?.part??'order';
  const pane=useRef<HTMLElement>(null);
  const original=caseOriginal(number);
  const record=localCases.get(number)??(loaded?.caseNumber===number?loaded:null);
  useEffect(()=>{
    setError('');setWaiting(false);
    if(pane.current)pane.current.scrollTop=0;
    if(!number){setError('사건번호를 확인할 수 없습니다.');return;}
    if(localCases.has(number))return;
    let current=true,retryTimer=0;
    const item=readCase(session,new URLSearchParams({metadata:'case',case:number}).toString());
    item.promise.then(data=>{
      if(data.caseNumber!==number)throw Error('판례 정보의 사건번호가 일치하지 않습니다.');
      if(current)setRecord(data);
    }).catch(e=>{
      if(!current)return;
      if(e instanceof ReaderError&&e.status===429){
        setError(automaticRetryMessage(e));setWaiting(true);
        retryTimer=window.setTimeout(()=>setAttempt(n=>n+1),e.wait*1000);
      }else setError(e instanceof Error?e.message:'판례를 불러오지 못했습니다.');
    });
    return ()=>{current=false;clearTimeout(retryTimer);item.release();};
  },[session,number,attempt]);
  const blocks=useMemo(()=>judgmentBlocks(record?.content||[]),[record]);
  useLayoutEffect(()=>{
    if((!focusJudgment&&!requested)||!record||record.format!=='text')return;
    const frame=requestAnimationFrame(()=>{
      const host=pane.current?.closest<HTMLElement>('.source-dialog');
      const heading=pane.current?.querySelector<HTMLElement>(part==='order'?'[data-judgment-start]':'[data-judgment-reasons]');
      if(host&&heading)host.scrollTop+=heading.getBoundingClientRect().top-host.getBoundingClientRect().top-6;
    });
    return ()=>cancelAnimationFrame(frame);
  },[record,part,focusKey,focusJudgment,requested]);
  const url=officialURL(caseDestination(number))||officialURL(record?.officialUrl)||officialURL(target?.url);
  const urlLabel=url?.includes('/precSc.do')?'공식 판례 검색':url?.includes('peruse_status')?'법원 판결서 열람 안내':'공식 사이트에서도 보기';
  const jumpTo=(next:CasePart)=>setJump(old=>({number,key:focusKey,part:next,sequence:(old?.sequence??0)+1}));
  const actions=record?.available&&<>{(['order','reasons'] as const).map(key=>(original?.[key]||blocks.some(b=>b.part===key))&&
    <button key={key} type="button" className={'case-jump-'+key} onClick={()=>jumpTo(key)}>{number==='Timbers'?(key==='order'?'결론':'법정의견'):(key==='order'?'주문':'이유')}</button>)}</>;
  return <>
    {onClose&&<div className="case-navigation" role="group" aria-label="판결문 이동">
      {navigation}{!target?.noteNumber&&<button type="button" onClick={onClose}>인용자료로 돌아가기</button>}{actions}
    </div>}
    <section className={onClose?'source-dialog case-pane':'case-pane embedded-case'} ref={pane} data-case-number={number} aria-label={'판례 원문 '+number}>
      <div className="case-pane-actions"><strong>판례 원문</strong>{!onClose&&actions}</div>
      {onClose&&<h2>{record?.title||number||target?.title}</h2>}
      <p className="case-identification">{record?.header||number}</p>
      {record?.sourceLabel&&<p className="case-source">{record.sourceLabel}{record.scope&&' · '+record.scope}</p>}
      {(record?.notice||original?.note)&&<p className="case-source">{record?.notice||original?.note}</p>}
      {url&&<a className="case-official-link" href={url} target="_blank" rel="noopener noreferrer">{urlLabel} ↗</a>}
      {error?<p className="case-status" role="status">{error} {!waiting&&<button type="button" onClick={()=>setAttempt(n=>n+1)}>다시 불러오기</button>}</p>:
        !record?<p className="case-status" role="status">판결문을 불러오는 중…</p>:
        !record.available?<p className="case-status" role="status">{record.message||'이 판례의 공개 원문은 현재 연결되어 있지 않습니다.'}</p>:
        record.format==='pages'&&record.sourceId?renderReference?.(record.sourceId,original,part,focusKey+'/'+(requested?.sequence??0)):
        <div className="case-original-text">{blocks.map((block,index)=>block.heading?
          <h3 key={index} data-judgment-start={block.part==='order'?'':undefined} data-judgment-reasons={block.part==='reasons'?'':undefined}>{block.text}</h3>:
          <p key={index}>{originalParagraph(block.text)}</p>)}</div>}
    </section>
  </>;
}
