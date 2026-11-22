import React, {useEffect, useMemo, useRef, useState} from 'react';
import {citedPageLabel, citedTextParts, type CitedTextSection} from './citation-model';
import {matchesCitationText,numericCitationParts,type TextCitationLocator} from './review-citation-links';
import './cited-text-source.css';

export default function CitedTextSource({text,sections,locator,focus}: {text:string;sections?:CitedTextSection[];locator?:TextCitationLocator;focus?:{offset:number;serial:number}}) {
  const [verified,setVerified]=useState<{text:string;sha256:string}|null>(null);
  useEffect(()=>{let cancelled=false;setVerified(null);if(locator)matchesCitationText(text,locator.sha256).then(matches=>{if(matches&&!cancelled)setVerified({text,sha256:locator.sha256});}).catch(()=>{});return()=>{cancelled=true;};},[text,locator?.sha256]);
  const exact=!!locator&&verified?.text===text&&verified.sha256===locator.sha256;
  const parts=useMemo(()=>exact?numericCitationParts(text,locator!.ranges):citedTextParts(text,sections).map(part=>({...part,label:part.printed?citedPageLabel(part.printed):undefined})),[text,sections,locator,exact]);
  const anchors = useRef(new Map<number, HTMLElement>());
  const locators=exact?locator!.ranges:parts.filter(part=>part.label).map(part=>({start:part.start,label:part.label!}));
  useEffect(()=>{const first=exact&&(focus&&locator!.ranges.some(range=>range.start===focus.offset)?focus.offset:locator!.ranges[0]?.start);if(typeof first==='number')anchors.current.get(first)?.scrollIntoView({block:'nearest',behavior:'instant'});},[exact,locator,focus?.offset,focus?.serial]);
  return <>
    {locators.length>0 && <div className="source-locators" aria-label="인용 위치">
      {locators.map(part => <button key={part.start} onClick={() => anchors.current.get(part.start)?.scrollIntoView({block: 'nearest', behavior: 'smooth'})}>{part.label}</button>)}
    </div>}
    <pre>{parts.map(part => part.label ? <mark className="cited-text-page" key={part.start} aria-label={'인용 '+part.label} ref={element => {if (element) anchors.current.set(part.start, element); else anchors.current.delete(part.start);}}>{part.text}</mark> : <React.Fragment key={part.start}>{part.text}</React.Fragment>)}</pre>
  </>;
}
