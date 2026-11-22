import React,{useEffect,useMemo,useState} from 'react';
import {folioDescription} from './thesis-folios';
import {privateResource,type Catalog,type Note,type Session} from './reader-api';

export default function ContentsSearch({session,catalog,notes,go}:{session:Session;catalog:Catalog;notes:Note[];go:(page:number,note?:Note)=>void}){
  const [query,setQuery]=useState(''),[results,setResults]=useState<{page:number;text:string}[]>([]),[message,setMessage]=useState(''),[retry,setRetry]=useState(0);
  const term=query.trim();
  const toc=useMemo(()=>catalog.toc.filter(r=>!term||r.title.toLocaleLowerCase().includes(term.toLocaleLowerCase())),[catalog,term]);
  const matches=useMemo(()=>term.length>=2?notes.filter(n=>n.text.toLocaleLowerCase().includes(term.toLocaleLowerCase())||String(n.number)===term).slice(0,25):[],[notes,term]);
  useEffect(()=>{
    setResults([]);setMessage('');if(term.length<2||catalog.searchEnabled!==true)return;
    const c=new AbortController();
    const timer=window.setTimeout(async()=>{
      setMessage('검색 중…');
      try{const response=await privateResource(session,new URLSearchParams({metadata:'search',q:term}),c.signal);
        const payload=await response.json();if(c.signal.aborted)return;
        const found=Array.isArray(payload.results)?payload.results.filter((r:{page:number;text:string})=>r.page>0&&r.page<=catalog.pageCount&&typeof r.text==='string').slice(0,25):[];
        setResults(found);setMessage(found.length?'':'본문에서 일치하는 구절이 없습니다.');
      }catch{if(!c.signal.aborted)setMessage('본문 검색을 다시 시도해 주세요.');}
    },300);
    return()=>{clearTimeout(timer);c.abort();};
  },[session,term,catalog.pageCount,catalog.searchEnabled,retry]);
  return <aside className="toc-pane"><h2>목차·검색</h2><label>{catalog.searchEnabled?'목차·본문·각주 검색':'목차·현재 쪽 각주 검색'}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="검색어 두 글자 이상"/></label>
    {catalog.searchEnabled&&term.length>=2&&<section><h3>본문</h3>{message&&<p role="status">{message}</p>}{message.includes('다시 시도')&&<button onClick={()=>setRetry(n=>n+1)}>다시 시도</button>}{results.map((r,i)=><button key={i} onClick={()=>go(r.page)}><span>{r.text}</span><small>{folioDescription(r.page)}</small></button>)}</section>}
    {matches.length>0&&<section><h3>각주</h3>{matches.map(n=><button key={n.number} onClick={()=>go(n.page,n)}><span>각주 {n.number} · {n.text.slice(0,90)}</span><small>{folioDescription(n.page)}</small></button>)}</section>}
    {term&&<h3>목차</h3>}{toc.map((row,i)=><button key={i} style={{paddingLeft:Math.min(4,row.level||1)*9+'px'}} onClick={()=>go(row.page)}>{row.title}<small>{folioDescription(row.page)}</small></button>)}
  </aside>;
}
