import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {privateResource,type Session} from './reader-api';
import {officialURL,type PageTarget} from './page-text';
import {getPageImage} from './visible-page-cache';
import {isPublicLawEdition,readerLawEditions as LAW_VERSIONS} from './verified-law-targets';
import './law-pane.css';
import {folioDescription} from './thesis-folios';

type LawBlock={type:'article'|'heading'|'supplement';id?:string;title?:string;text?:string;paragraphs?:string[]};
export type LawRecord={key:string;name:string;status:'current'|'historical'|'foreign';jurisdiction?:string;available:boolean;format:'articles';effectiveDate?:string;versionLabel?:string;retrievedAt?:string;currentKey?:string;officialUrl?:string;sourceLabel?:string;scope?:string;articles:LawBlock[];supplements?:LawBlock[]};
export function citedArticle(target:PageTarget){
  if(target.articleId)return target.articleId;
  const pattern=/제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/;
  const match=target.label?.match(pattern)??target.title?.match(pattern);
  return match?String(Number(match[1]))+(match[2]?'-'+Number(match[2]):''):'';
}
export function linkedLawKey(target:PageTarget){
  if(target.lawKey&&LAW_VERSIONS.some(v=>v.key===target.lawKey))return target.lawKey;
  if(target.status==='proposal'||target.status==='draft-provision'||target.status==='unresolved'||target.status==='bill-proposal')return '';
  if(target.status==='foreign'){
    try{const u=new URL(target.url||''),name=(target.title||'').replace(/\s+제\d+조.*$/,'');
      if(u.hostname==='www.gesetze-im-internet.de'){const k=u.pathname.split('/')[1];const names:Record<string,string>={inso:'독일 도산법',bgb:'독일 민법',zvg:'독일 강제경매법'};return names[k]===name?'de-'+k:'';}
      if(u.hostname==='laws.e-gov.go.jp'&&u.pathname.includes('411AC0000000225')&&name==='일본 민사재생법')return 'jp-civil-rehabilitation';
      if(u.hostname==='uscode.house.gov'&&name==='미국 연방파산법'&&/title11|t11/.test(u.href))return 'us-title11';
    }catch{}return '';
  }
  try{const url=new URL(target.url||'');if(!/(^|\.)law\.go\.kr$/.test(url.hostname))return '';const mst=url.searchParams.get('lsiSeq');return mst&&LAW_VERSIONS.some(v=>v.key==='kr-'+mst)?'kr-'+mst:'';}catch{return '';}
}
function date(s?:string){return s?.match(/^\d{8}$/)?s.slice(0,4)+'. '+Number(s.slice(4,6))+'. '+Number(s.slice(6))+'.':s;}
function supplementArticle(block:LawBlock,text:string){
  const number=text.match(/^제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/);
  return number?block.id+'-'+number[1]+(number[2]?'-'+number[2]:''):undefined;
}
function jump(host:HTMLElement|null,id:string){const node=host?.querySelector<HTMLElement>('[data-law-id="'+id+'"]');if(host&&node){const top=node.getBoundingClientRect().top-host.getBoundingClientRect().top+host.scrollTop;host.scrollTop=Math.max(0,top-72);return true;}return false;}
function ProposalPages({session,page,bill=false}:{session:Session;page:number;bill?:boolean}){
  const [pictures,setPictures]=useState<{page:number;url:string}[]>([]),[error,setError]=useState(''),[retry,setRetry]=useState(0);const container=useRef<HTMLDivElement>(null);
  useEffect(()=>{let alive=true;const urls:string[]=[];setPictures([]);setError('');const entries=[page].map(p=>({page:p,item:getPageImage(session,'page='+p)}));
    Promise.all(entries.map(async x=>{const blob=await x.item.promise;if(!alive)return null;const url=URL.createObjectURL(blob);urls.push(url);return{page:x.page,url};})).then(rows=>{if(alive)setPictures(rows.filter((x):x is {page:number;url:string}=>!!x));}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'시안 원문을 불러오지 못했습니다.');});
    return()=>{alive=false;entries.forEach(x=>x.item.release());urls.forEach(u=>URL.revokeObjectURL(u));};
  },[session,retry,bill,page]);
  useLayoutEffect(()=>{if(pictures.length)jump(container.current?.closest<HTMLElement>('.law-pane')||null,'proposal-'+page);},[pictures,page]);
  return <div className="law-proposals" ref={container}>{error?<p role="status">{error} <button onClick={()=>setRetry(n=>n+1)}>다시 불러오기</button></p>:!pictures.length?<p role="status">논문의 개정안 설명을 불러오는 중…</p>:pictures.map(p=><figure key={p.page} data-law-id={'proposal-'+p.page}><figcaption>{bill?'논문의 국회 발의안 설명':'논문 부록'} · {folioDescription(p.page)}</figcaption><div className="law-proposal-image"><img src={p.url} alt={'논문 '+folioDescription(p.page)+' 원문'} draggable={false}/></div></figure>)}</div>;
}
export default function LawPane({session,target,onClose}:{session:Session;target:PageTarget;onClose:()=>void}){
  const [selectedKey,setSelectedKey]=useState(()=>linkedLawKey(target)),[record,setRecord]=useState<LawRecord|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[jumpInput,setJumpInput]=useState(''),[notice,setNotice]=useState('');
  const host=useRef<HTMLElement>(null),article=citedArticle(target),bill=target.status==='bill-proposal',proposal=target.status==='proposal'||target.status==='draft-provision'||bill;
  useEffect(()=>{const key=linkedLawKey(target);setSelectedKey(key);setJumpInput(article.startsWith('supplement-')?(target.label||''):article.replace('-','조의'));if(!key&&target.status!=='proposal'&&target.status!=='bill-proposal'&&host.current)host.current.scrollTop=0;},[target,article]);
  useEffect(()=>{
    const c=new AbortController();setRecord(null);setError('');setNotice('');if(host.current)host.current.scrollTop=0;
    if(!selectedKey||proposal)return()=>c.abort();
    const resource=isPublicLawEdition(selectedKey)
      ?fetch(new URL('law-editions/'+selectedKey+'.json',document.baseURI),{signal:c.signal,credentials:'same-origin'})
      :privateResource(session,new URLSearchParams({metadata:'law',law:selectedKey}),c.signal);
    resource.then(r=>{if(!r.ok)throw Error('법령 원문을 불러오지 못했습니다.');return r.json();}).then((data:LawRecord)=>{
      if(c.signal.aborted)return;if(data.key!==selectedKey||data.format!=='articles'||!Array.isArray(data.articles))throw Error('법령 원문을 확인하지 못했습니다.');setRecord(data);
    }).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:'법령 원문을 불러오지 못했습니다.');});return()=>c.abort();
  },[session,selectedKey,attempt,proposal]);
  useLayoutEffect(()=>{if(!record||record.key!==selectedKey)return;setNotice('');if(article.startsWith('supplement-')&&selectedKey!==linkedLawKey(target))return;if(article&&!jump(host.current,article))setNotice('이 판본에서 '+(target.label||'인용 조문')+'을 찾지 못했습니다. 법령명·판본·본문과 부칙의 구분을 확인해 주세요.');},[record,selectedKey,article,target]);
  const targetUrl=officialURL(target.url);
  const deepLink=targetUrl?new URL(targetUrl):null;
  const citedEdition=selectedKey&&selectedKey===linkedLawKey(target);
  const edition=LAW_VERSIONS.find(v=>v.key===selectedKey);
  const exactArticle=citedEdition&&!!target.articleId&&!!deepLink;
  const url=exactArticle?targetUrl:officialURL(edition?.officialUrl)||targetUrl;
  const choices=LAW_VERSIONS.filter(v=>v.status==='current'||v.status==='foreign'||v.key===linkedLawKey(target));
  const unidentified=!selectedKey&&!proposal;
  const unavailableNotice:Record<string,string>={
    'foreign-unavailable':'인용된 외국 법령의 원전을 아직 확보하지 못했습니다.',
    'foreign-historical-unavailable':'인용된 외국 구법의 해당 판본을 아직 확보하지 못했습니다.',
    'model-law-unavailable':'인용된 모델법의 해당 원전을 아직 확보하지 못했습니다.',
    'restatement-unavailable':'인용된 Restatement의 해당 원전을 아직 확보하지 못했습니다.',
  };
  const unavailable=unavailableNotice[target.status||''];
  const heading=bill?'국회 발의안 설명':proposal?'논문 입법시안':unavailable?'인용 원전':'법령 전문';
  return <section className="source-dialog law-pane" ref={host} aria-label={heading}>
    <div className="law-pane-actions"><strong>{heading}</strong><button type="button" onClick={onClose}>인용자료로 돌아가기</button></div>
    <h2>{record?.name||target.title||'인용 법령'}</h2>
    {proposal?<><p className="law-scope">{bill?'이 인용은 국회 발의 개정안에 관한 논문의 설명입니다. 현행 법령이나 필자의 부록 시안과 구별하여 원문 쪽을 표시합니다.':'이 자료는 필자의 입법시안이며 현행 법령이 아닙니다. 논문에 기재된 제안 원문을 표시합니다.'}</p>{target.targetPage?<><button onClick={()=>jump(host.current,'proposal-'+target.targetPage)}>인용 부분으로 돌아가기</button><ProposalPages session={session} page={target.targetPage} bill={bill}/></>:<p>논문에서 이 인용의 쪽을 확인해 주세요.</p>}</>:<>
      {unidentified&&<p className="law-scope" role="status">{unavailable||(target.status==='historical'?'이 인용은 연혁법령 또는 부칙에 관한 것으로, 적용 판본이 특정되지 않았습니다. 현재 조문으로 자동 대체하지 않습니다.':target.status==='foreign'?'외국 법령입니다. 이 법령의 전문은 아래 공식 원문에서 확인할 수 있습니다.':'이 인용의 법령명을 확정하지 못했습니다. 읽으려는 법령을 직접 선택해 주세요.')}</p>}
      {!unavailable&&(!unidentified||target.status!=='foreign')&&<label className="law-select">{unidentified?'열람할 법령 선택':'법령 판본'}<select value={selectedKey} onChange={e=>{setSelectedKey(e.target.value);setNotice('');}}><option value="">법령 선택</option>{selectedKey&&!choices.some(v=>v.key===selectedKey)&&<option value={selectedKey}>{LAW_VERSIONS.find(v=>v.key===selectedKey)?.name} · 연결된 연혁판본</option>}{choices.map(v=><option key={v.key} value={v.key}>{v.name} · {v.status==='foreign'?'외국 법령':date(v.effectiveDate)+' 시행'}</option>)}</select></label>}
      {record&&<><p className="law-version">{record.status==='current'?'현행 판본':record.status==='foreign'?'외국법 원문':'연결된 연혁판본'} · {record.versionLabel||('시행 '+date(record.effectiveDate))}</p><p className="law-source">{record.sourceLabel} · 확인 {record.retrievedAt}</p><p className="law-scope">{record.status==='current'?'현재 시행 중인 법령입니다. 논문이 다루는 사건 당시의 적용법령과는 다를 수 있습니다.':record.status==='foreign'?'공식 외국어 원문입니다. 한국법 및 한국어 번역문과 구별하여 열람해 주세요.':'논문의 기존 링크가 가리키는 판본입니다. 오늘의 현행법과 구별하여 열람해 주세요.'} {record.scope}</p>{record.currentKey&&record.currentKey!==record.key&&<button onClick={()=>setSelectedKey(record.currentKey!)}>오늘의 현행 판본 열기</button>}</>}
      {url&&<a className="law-official" href={url} target="_blank" rel="noopener noreferrer">공식 원문에서도 보기 ↗</a>}
      {record&&<form className="law-jump" onSubmit={e=>{e.preventDefault();const m=jumpInput.match(/(?:제\s*)?(\d+)(?:\s*조)?(?:\s*(?:의|-)\s*(\d+))?/);const id=m?String(Number(m[1]))+(m[2]?'-'+Number(m[2]):''):'';setNotice(id&&jump(host.current,id)?'':'입력한 조문을 이 판본에서 찾지 못했습니다.');}}><label>조문 이동<input aria-label="이동할 조문 번호" value={jumpInput} onChange={e=>setJumpInput(e.target.value)} placeholder="150 또는 3조의2"/></label><button type="submit">이동</button><button type="button" onClick={()=>setNotice(jump(host.current,article)?'':'이 판본에서 인용 조문을 찾지 못했습니다.')}>인용 조문으로 돌아가기</button></form>}
      {notice&&<p className="law-scope" role="status">{notice}</p>}{error?<p className="law-status" role="status">{error} <button onClick={()=>setAttempt(n=>n+1)}>다시 불러오기</button></p>:selectedKey&&!record?<p role="status">법령 전문을 불러오는 중…</p>:null}
      {record&&<div className="law-original">{record.articles.map((b,i)=>b.type==='heading'?<h3 className="law-division" key={'heading-'+i}>{b.text}</h3>:<article key={b.id||i} data-law-id={b.id} className={b.id===article?'law-article cited':'law-article'}><h3>{b.title}</h3>{b.paragraphs?.map((p,j)=><p key={j}>{p}</p>)}</article>)}{!!record.supplements?.length&&<h3 className="law-division">부칙</h3>}{record.supplements?.map((b,i)=><article className="law-supplement" key={b.id||i} data-law-id={b.id}><h3>{b.title}</h3>{b.paragraphs?.map((p,j)=><p key={j} data-law-id={supplementArticle(b,p)} className={supplementArticle(b,p)===article?'cited':undefined}>{p}</p>)}</article>)}</div>}
    </>}
  </section>;
}
