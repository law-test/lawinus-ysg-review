import React from 'react';
import {verifiedInlineLinks,type InlineCitationRecord} from './review-citation-links';

export default function InlineCitationText({text,record,sourceIds,onOpen}:{text:string;record?:InlineCitationRecord;sourceIds:Set<string>;onOpen:(sourceId:string,focus?:number)=>void}){
  const links=verifiedInlineLinks(text,record,sourceIds);
  const parts:React.ReactNode[]=[];let cursor=0;
  for(const link of links){
    parts.push(text.slice(cursor,link.start));
    parts.push(<button type="button" className="inline-source-citation" key={link.start} title={link.label+' 열기'} onClick={()=>onOpen(link.sourceId,link.focus)}>{text.slice(link.start,link.end)}</button>);
    cursor=link.end;
  }
  parts.push(text.slice(cursor));return <>{parts}</>;
}
