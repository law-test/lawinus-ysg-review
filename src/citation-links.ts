import data from './citation-link-data.json';
import spanData from './law-citation-spans.json';
import type {PageTarget} from './page-text';

const cases:Record<string,string>=data.sourceCases;
const destinations:Record<string,string>=data.caseDestinations;
const extra=data.extra as Record<string,PageTarget[]>;
const external=new Set(Object.values(extra).flat().filter(t=>t.kind==='external').map(t=>t.url));

export function bibliographyURL(url?:string){
  return url&&external.has(url)?url:undefined;
}

export function catalogCase(sourceId?:string){
  return sourceId?cases[sourceId]:undefined;
}

export function caseDestination(number:string){
  return destinations[number];
}

type CitationSpan = Pick<PageTarget, 'line' | 'label' | 'x' | 'y' | 'w' | 'h' | 'noteStart' | 'noteEnd'>;
type SpanEdit = {
  guard: [number, number, string];
  replace?: CitationSpan[];
  append?: CitationSpan[];
};
const citationSpans = spanData as unknown as Record<string, Record<string, SpanEdit>>;

// A printed citation can continue on the next line. Each rectangle opens the same
// verified destination; noteStart/noteEnd refer to the entire unwrapped citation.
function applyCitationSpans(page: number, targets: PageTarget[]): PageTarget[] {
  const edits = citationSpans[page];
  if (!edits) return targets;
  return targets.flatMap((target, index) => {
    const edit = edits[index];
    if (!edit) return [target];
    const [line, x, label] = edit.guard;
    if (target.line !== line || target.x !== x || target.label !== label) return [target];
    const expand = (span: CitationSpan): PageTarget => {
      let title = target.title;
      if (span.label && title?.endsWith(label)) {
        title = span.label.startsWith('같은 조')
          ? title + ' · ' + span.label
          : title.slice(0, title.length - label.length) + span.label;
      }
      return {...target, ...span, title};
    };
    const replaced = edit.replace ? edit.replace.map(expand) : [target];
    return edit.append ? [...replaced, ...edit.append.map(expand)] : replaced;
  });
}

export function repairCitationTargets(page:number,raw:PageTarget[]){
  const targets=raw;
  const repaired=targets.map(t=>{
    const url=t.kind==='case'&&t.label?destinations[t.label]:undefined;
    return url?{...t,url}:t;
  }).concat(extra[String(page)]??[]);
  return applyCitationSpans(page, repaired);
}
