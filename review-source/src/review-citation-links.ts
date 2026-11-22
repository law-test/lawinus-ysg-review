export type TextCitationRange = {label:string;start:number;end:number};
export type TextCitationLocator = {sourceId:string;sha256:string;ranges:TextCitationRange[]};
export type InlineCitationLink = {start:number;end:number;sourceId:string;label:string;focus?:number};
export type InlineCitationRecord = {length:number;hash:number;links:InlineCitationLink[]};

export function textFingerprint(text:string):number {
  let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619)>>>0;
  return hash;
}

export function verifiedInlineLinks(text:string,record:InlineCitationRecord|undefined,knownIds:Set<string>):InlineCitationLink[] {
  if(!record||record.length!==text.length||record.hash!==textFingerprint(text))return [];
  let end=0;
  return record.links.filter(link=>{
    if(!Number.isInteger(link.start)||!Number.isInteger(link.end)||link.start<end||link.end<=link.start||link.end>text.length||!knownIds.has(link.sourceId))return false;
    end=link.end;return true;
  });
}

export async function matchesCitationText(text:string,sha256:string):Promise<boolean> {
  if(!/^[a-f0-9]{64}$/.test(sha256)||!globalThis.crypto?.subtle)return false;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('')===sha256;
}

export function numericCitationParts(text:string,ranges:TextCitationRange[]):{text:string;start:number;label?:string}[] {
  const ordered=[...ranges].sort((a,b)=>a.start-b.start);
  const parts:{text:string;start:number;label?:string}[]=[];let cursor=0;
  for(const range of ordered){
    if(!Number.isInteger(range.start)||!Number.isInteger(range.end)||range.start<cursor||range.end<=range.start||range.end>text.length)return [{text,start:0}];
    if(range.start>cursor)parts.push({text:text.slice(cursor,range.start),start:cursor});
    parts.push({text:text.slice(range.start,range.end),start:range.start,label:range.label});cursor=range.end;
  }
  if(cursor<text.length||!parts.length)parts.push({text:text.slice(cursor),start:cursor});
  return parts;
}
