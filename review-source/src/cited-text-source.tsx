import React, {useMemo, useRef} from 'react';
import {citedPageLabel, citedTextParts, type CitedTextSection} from './citation-model';
import './cited-text-source.css';

export default function CitedTextSource({text, sections}: {text: string; sections?: CitedTextSection[]}) {
  const parts = useMemo(() => citedTextParts(text, sections), [text, sections]);
  const anchors = useRef(new Map<number, HTMLElement>());
  return <>
    {parts.some(part => part.printed) && <div className="source-locators" aria-label="인용면">
      {parts.filter(part => part.printed).map(part => <button key={part.start} onClick={() => anchors.current.get(part.start)?.scrollIntoView({block: 'nearest', behavior: 'smooth'})}>{citedPageLabel(part.printed!)}</button>)}
    </div>}
    <pre>{parts.map(part => part.printed ? <mark className="cited-text-page" key={part.start} aria-label={'인용 ' + citedPageLabel(part.printed)} ref={element => {if (element) anchors.current.set(part.start, element); else anchors.current.delete(part.start);}}>{part.text}</mark> : <React.Fragment key={part.start}>{part.text}</React.Fragment>)}</pre>
  </>;
}
