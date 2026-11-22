import data from './citation-boundary-data.json';
import type {PageTarget} from './page-text';

export function repairCitationBoundaries(page:number,targets:PageTarget[],edition='ysg-20261121'){
  if(edition!==data.edition)return targets;
  const patches=data.patches.filter(patch=>patch.page===page);
  if(!patches.length)return targets;
  return targets.map(target=>{
    const patch=patches.find(patch=>patch.number===(target.noteNumber??target.number));
    const update=target.kind==='note'&&patch?.updates.find(update=>
      update.sourceId===target.sourceId&&update.sourceGroup===target.sourceGroup&&
      update.oldNoteStart===target.noteStart&&update.oldNoteEnd===target.noteEnd);
    if(!update)return target;
    const rects=update.rects.filter(rect=>rect.page===page);
    if(!rects.length)return target;
    return {...target,...rects[0],rects,sourcePage:update.sourcePage,noteStart:update.noteStart,noteEnd:update.noteEnd};
  });
}

export function sourceTargetAtPoint(targets:PageTarget[],point:{x:number;y:number}){
  return targets.find(target=>target.sourceGroup&&target.rects?.some(rect=>
    point.x>=rect.x&&point.y>=rect.y&&point.x<=rect.x+rect.w&&point.y<=rect.y+rect.h));
}
