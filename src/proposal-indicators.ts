import type {PdfTarget} from './pdf-viewer-model';

export type ProposalPriority='반드시 수정'|'강하게 권고'|'선택적';
export type ProposalIndicator={priority:ProposalPriority;tone:'required'|'recommended'|'optional';shortLabel:'필수'|'권고'|'선택';proposalIds:string[];primaryProposalId:string};
type Proposal={id:string;priority:string;before:string;page:number;page_end?:number;anchorId?:string;paragraphIds?:string[]};
type Paragraph={id:string;text:string;page:number;kind:string};
const PRIORITIES:Record<ProposalPriority,{rank:number;tone:ProposalIndicator['tone'];shortLabel:ProposalIndicator['shortLabel']}>= {
 '반드시 수정':{rank:3,tone:'required',shortLabel:'필수'},'강하게 권고':{rank:2,tone:'recommended',shortLabel:'권고'},'선택적':{rank:1,tone:'optional',shortLabel:'선택'},
};
const normalize=(value:string)=>value.replace(/\s+/g,' ').trim();
export function proposalLabel(indicator:ProposalIndicator){return `수정제안 있음 · ${indicator.priority}${indicator.proposalIds.length>1?` · ${indicator.proposalIds.length}건`:''}`;}

/** Match only recorded human anchors or complete source lines. Never infer urgency. */
export function buildProposalIndicators(proposals:Proposal[],paragraphs:Paragraph[]):Record<string,ProposalIndicator>{
 const byId=new Map(paragraphs.map(p=>[p.id,p])),matches=new Map<string,Proposal[]>();
 for(const proposal of proposals){
  if(!Object.hasOwn(PRIORITIES,proposal.priority)||/^FN\d+$/.test(proposal.id))continue;
  const anchor=proposal.anchorId||(/^INSERT_AFTER_(P\d+)$/.exec(proposal.id)?.[1])||proposal.id;
  const ids=new Set((proposal.paragraphIds||[]).filter(id=>byId.has(id)));
  if(byId.has(anchor))ids.add(anchor);
  const before=normalize(proposal.before),start=proposal.page,end=proposal.page_end??start;
  for(const paragraph of paragraphs){
   if(paragraph.page<start||paragraph.page>end)continue;
   const line=normalize(paragraph.text);
   // Complete lines within a grouped Before cover tables and multi-line TOC edits.
   // A generic short heading (e.g. '현 행') cannot establish a match on its own.
   if(line.length>=12&&(before===line||proposal.before.split(/\r?\n/).map(normalize).includes(line)))ids.add(paragraph.id);
  }
  for(const id of ids){const list=matches.get(id)||[];if(!list.some(p=>p.id===proposal.id))list.push(proposal);matches.set(id,list);}
 }
 return Object.fromEntries([...matches].map(([id,items])=>{
  items.sort((a,b)=>PRIORITIES[b.priority as ProposalPriority].rank-PRIORITIES[a.priority as ProposalPriority].rank);
  const priority=items[0].priority as ProposalPriority,{tone,shortLabel}=PRIORITIES[priority];
  return [id,{priority,tone,shortLabel,proposalIds:items.map(p=>p.id),primaryProposalId:items[0].id}];
 }));
}

export function pageProposalMarkers(targets:PdfTarget[],indicators:Record<string,ProposalIndicator>){
 const grouped=new Map<string,{target:PdfTarget;indicator:ProposalIndicator}>();
 for(const target of targets){
  const indicator=target.kind==='paragraph'?indicators[target.noteId]:undefined;if(!indicator)continue;
  const key=`${target.page}:${indicator.primaryProposalId}`,old=grouped.get(key);
  if(!old||target.rect[1]<old.target.rect[1]||target.rect[1]===old.target.rect[1]&&target.rect[0]<old.target.rect[0])grouped.set(key,{target,indicator});
 }
 return [...grouped.values()].sort((a,b)=>a.target.page-b.target.page||a.target.rect[1]-b.target.rect[1]);
}

/** Only margin labels move to avoid collisions; evidence rectangles never move. */
export function placeProposalMarkers(markers:ReturnType<typeof pageProposalMarkers>,pageHeight:number,sourceHeight:number,labelHeight:number){
 const rows=markers.map(marker=>({...marker,top:Math.max(0,Math.min(pageHeight-labelHeight,marker.target.rect[1]/sourceHeight*pageHeight))}));
 for(let i=1;i<rows.length;i++)rows[i].top=Math.max(rows[i].top,rows[i-1].top+labelHeight+2);
 if(rows.length&&rows.at(-1)!.top>pageHeight-labelHeight){
  rows.at(-1)!.top=Math.max(0,pageHeight-labelHeight);
  for(let i=rows.length-2;i>=0;i--)rows[i].top=Math.max(0,Math.min(rows[i].top,rows[i+1].top-labelHeight-2));
 }
 return rows;
}
