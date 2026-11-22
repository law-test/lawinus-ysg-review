export type CopySpacing={length:number;hash:number;insertions:number[][];joinBefore?:string};

export function textFingerprint(text:string){
  let value=2166136261;
  for(let i=0;i<text.length;i++)value=Math.imul(value^text.charCodeAt(i),16777619)>>>0;
  return value;
}

// The map contains positions only. Apply it solely to the exact protected text
// used when those positions were verified against the submitted manuscript.
export function restoreCopySpacing(text:string,map?:CopySpacing):{text:string;joinBefore?:string}{
  if(!map||map.length!==text.length||map.hash!==textFingerprint(text))return {text};
  let from=0,result='';
  for(const [offset,count] of map.insertions){
    if(!Number.isInteger(offset)||offset<from||offset>text.length||!Number.isInteger(count)||count<1||count>100)return {text};
    result+=text.slice(from,offset)+' '.repeat(count);from=offset;
  }
  if(map.joinBefore!==undefined&&!/^[\s]*$/.test(map.joinBefore))return {text};
  return {text:result+text.slice(from),joinBefore:map.joinBefore};
}
