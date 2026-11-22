import locations from './commentary-locations.json';
import type {PageTarget} from './page-text';

export function commentaryLocation(sourceId:string|undefined,number:number|undefined,edition='ysg-20261121'){
  return edition===locations.edition&&sourceId===locations.sourceId?locations.notes.find(n=>n.number===number):undefined;
}

export function commentaryTargets(targets:PageTarget[],edition='ysg-20261121'):PageTarget[]{
  if(edition!==locations.edition)return targets;
  return targets.map(target=>{
    const number=target.noteNumber??target.number;
    if(target.sourceId===locations.sourceId&&target.sourceGroup){
      const note=commentaryLocation(target.sourceId,number,edition);
      return note?{...target,sourcePage:note.position}:target;
    }
    if(target.kind!=='law')return target;
    const token=locations.tokens.find(t=>t.number===number&&t.start===target.noteStart&&t.end===target.noteEnd&&t.lawKey===target.lawKey&&t.articleId===target.articleId);
    // The offsets alone are insufficient: the printed token must also belong
    // to this exact commentary's bibliographic span in the same footnote.
    const source=token&&targets.find(t=>t.sourceId===locations.sourceId&&t.sourceGroup&&(t.noteNumber??t.number)===number&&t.noteStart!==undefined&&t.noteEnd!==undefined&&t.noteStart<=token.start&&t.noteEnd>=token.end);
    if(!token||!source)return target;
    return {...target,kind:'note',number,sourceId:locations.sourceId,sourcePage:token.position,
      commentaryToken:true,title:'온주 신탁법 · '+token.label,url:undefined,lawKey:undefined,articleId:undefined,status:undefined};
  });
}

export function commentaryLawTarget(articleId:string):PageTarget{
  return {kind:'law',lawKey:'kr-198564',articleId,status:'current',label:'제'+articleId+'조',title:'신탁법 제'+articleId+'조',url:'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=198564&efYd=20181101&ancYnChk=0',x:0,y:0,w:1,h:1};
}

export const commentaryParagraphCount=locations.sourceParagraphCount;
