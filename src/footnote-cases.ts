import index from './footnote-case-index.json';
import originals from './case-original-locations.json';
import type {PageTarget} from './page-text';

export type CasePart='order'|'reasons';
export type OriginalPoint={page:number;y:number;text:string};
export type CaseOriginal={sourceId:string;order:OriginalPoint;reasons?:OriginalPoint;note?:string;officialUrl?:string;title?:string};
const notes=index.notes as Record<string,string[]>;
const printed=index.targets as Record<string,PageTarget[]>;
const locations=originals as Record<string,CaseOriginal>;

export function casesInNote(number?:number):string[]{return notes[String(number)]??[];}
export function caseOriginal(number:string){return locations[number];}
// A decision named inside a publication title keeps a link on its docket digits.
export function docketInTitle(page:number,number:string,start:number,end:number,note?:number){
  return (printed[String(page)]||[]).filter(t=>t.noteNumber===note&&t.caseNumber===number&&
    t.label===number&&t.noteStart!==undefined&&t.noteEnd!==undefined&&t.noteStart>=start&&t.noteEnd<=end);
}
export function footnoteCaseTargets(page:number,targets:PageTarget[]){
  const verified=printed[String(page)]||[];
  if(!verified.length)return targets;
  return targets.filter(t=>{
    if(t.kind==='case'&&t.noteNumber&&casesInNote(t.noteNumber).length)return false;
    return true;
  }).concat(verified);
}
