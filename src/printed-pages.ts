import printedPageData from './printed-page-data.json';
import type {Citation} from './reader-api';

type PrintIndex = {
  ranges: Record<string, number[][]>;
  labels: Record<string, Record<string, string>>;
  spreads?: Record<string, Record<string, string[]>>;
  citations?: Record<string, Record<string, number[][]>>;
  editions?: Record<string, Record<string, string>>;
  extraSources?: Record<string,Citation[]>;
  alternateFolios?: Record<string,{primaryName:string;name:string;ranges:number[][]}>;
};

const printIndex: PrintIndex = printedPageData;
export type CitationGroup = {start:number; end:number; printedStart?:string; printedEnd?:string};
export type AlternateFolio = {primaryName:string;name:string;label:string};
type Page = {page:number; label?:string; spread?:string[];alternate?:AlternateFolio};

export function printedLabels(sourceId:string) {
  const labels = new Map<number,string>();
  for (const [first,last,printed] of printIndex.ranges[sourceId] ?? []) {
    for (let page = first; page <= last; page++) labels.set(page, String(printed + page - first));
  }
  for (const [page,label] of Object.entries(printIndex.labels[sourceId] ?? {})) labels.set(Number(page),label);
  return labels;
}

export function printedSpreads(sourceId:string):Record<string,string[]> {
  return printIndex.spreads?.[sourceId] ?? {};
}

export function alternateFolios(sourceId:string) {
  const result=new Map<number,AlternateFolio>();
  const series=printIndex.alternateFolios?.[sourceId];
  if(series)for(const [first,last,printed] of series.ranges){
    for(let page=first;page<=last;page++)result.set(page,{primaryName:series.primaryName,name:series.name,label:String(printed+page-first)});
  }
  return result;
}

export function citedEdition(sourceId:string,noteNumber?:number) {
  return noteNumber===undefined?sourceId:printIndex.editions?.[sourceId]?.[String(noteNumber)]??sourceId;
}

export function extraCitationSources(noteNumber:number) {
  return printIndex.extraSources?.[String(noteNumber)]??[];
}

export function pageLabels(page:Page) {
  return page.spread?.length ? page.spread : page.label ? [page.label] : [];
}

export function lookupLabels(page:Page) {
  const labels=pageLabels(page);
  return page.alternate?[...labels,page.alternate.label]:labels;
}

export function labelKey(label:string) {
  return label.normalize('NFKC').trim().replace(/^p\.\s*(?=\d)/iu,'').replace(/\s*(?:쪽|면|[pP]\.?)$/u,'').trim().toLowerCase().replace(/^0+(?=\d+$)/u,'');
}

export function citationGroups(sourceId:string,noteNumber:number|undefined,pages:Page[]):CitationGroup[] {
  const available = new Map(pages.map(page=>[page.page,page]));
  const groups = noteNumber===undefined?[]:printIndex.citations?.[sourceId]?.[String(noteNumber)]??[];
  const unique = new Map<string,CitationGroup>();
  for (const [start,end,printedStart,printedEnd] of groups) {
    if (!available.has(start)) continue;
    const group={start,end:available.has(end)?end:start,printedStart:printedStart==null?undefined:String(printedStart),printedEnd:printedEnd==null?undefined:String(printedEnd)};
    unique.set([group.start,group.end,group.printedStart,group.printedEnd].join('/'),group);
  }
  return [...unique.values()];
}

export function pageDescription(page:Page) {
  const labels=pageLabels(page);
  if(page.alternate){
    const primary=labels.length?page.alternate.primaryName+' '+labels.join('·')+'쪽 · ':'';
    return primary+page.alternate.name+' '+page.alternate.label+'쪽';
  }
  return labels.length ? '인쇄 '+labels.join('·')+'쪽' : '인쇄 쪽번호 미확인 · 수록 '+page.page+'번째 면';
}

