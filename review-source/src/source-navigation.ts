import {citedPages,citedSourceRefs,type CitationMap} from './citation-model';

type Source={id?:string;available?:boolean;kind?:string;pages?:number;officialUrl?:string;searchUrl?:string;pageMap?:{page?:number;servedPage?:number;originalPage?:number;printedPages?:string[]}[]};
type Note={id:string;sourceRefs?:{sourceId:string;[key:string]:any}[]};

export function sourceExternalUrl(source?:Source):string|null{
  for(const candidate of [source?.officialUrl,source?.searchUrl]){
    if(typeof candidate!=='string'||!/^https?:\/\//i.test(candidate))continue;
    try{const url=new URL(candidate);if(url.protocol==='http:'||url.protocol==='https:')return url.href;}catch{}
  }
  return null;
}

export function sourceDocumentUrl(source:Source|undefined,assetUrl:(id:string)=>string):string|null{
  if(!source?.id)return null;
  return source.available===false?sourceExternalUrl(source):assetUrl(source.id);
}

// Keep the citation list unchanged; only choose a useful initial document.
export function preferredSourceRef(note:Note,map:CitationMap,sources:Source[],preferredId?:string){
  const known=sources.filter((source):source is Source&{id:string}=>typeof source.id==='string');
  const byId=new Map(known.map(source=>[source.id,source]));
  const refs=citedSourceRefs(note,map,known).filter(ref=>byId.has(ref.sourceId));
  const chosen=refs.find(ref=>ref.sourceId===preferredId);
  if(chosen)return chosen;
  const priority=(sourceId:string)=>{
    const source=byId.get(sourceId)!;
    if(source.available===false)return 2;
    return source.kind==='pdf'&&citedPages(map[note.id]?.[sourceId],source.pages).length?0:1;
  };
  return refs.reduce<(typeof refs)[number]|undefined>((best,ref)=>!best||priority(ref.sourceId)<priority(best.sourceId)?ref:best,undefined);
}

export function excerptPageLabel(source:Source,page:number):string{
  const mapping=source.pageMap?.find(item=>(item.servedPage??item.page)===page);
  const printed=mapping?.printedPages?.filter(value=>typeof value==='string'&&value.trim()).map(value=>/(?:면|쪽)$/.test(value)?value:value+'면');
  const original=mapping?.originalPage;
  return [`발췌 ${page}${source.pages?'/'+source.pages:''}쪽`,printed?.length?'인쇄 '+printed.join(', '):'인쇄면 미확인',typeof original==='number'&&Number.isInteger(original)&&original>0?`원본 PDF ${original}쪽`:'원본 PDF 쪽수 미확인'].join(' · ');
}
