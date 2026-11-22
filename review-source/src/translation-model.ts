export type TranslationBlock={id:string;kind:string;original:string;translation:string;[key:string]:unknown};
export type TranslationPage={pdfPage:number;printedPage:string;blocks:TranslationBlock[];translatorNotes?:unknown[];[key:string]:unknown};
export type TranslationDocument={sourceId:string;title:string;language:string;sourceSha256:string;totalPages:number;pages:TranslationPage[];scope?:string;[key:string]:unknown};
export type TranslationEntry={sourceId:string;title:string;language:string;file:string;sourceSha256:string;totalPages:number;kind:'pdf'|'text';noteIds?:string[];scope:string};
export function validateTranslation(value:unknown,entry:TranslationEntry):TranslationDocument{
  const d=value as TranslationDocument;
  if(!d||d.sourceId!==entry.sourceId||d.sourceSha256!==entry.sourceSha256||d.totalPages!==entry.totalPages||!Array.isArray(d.pages))throw Error('원전과 번역의 연결 정보를 확인하지 못했습니다.');
  const seen=new Set<number>(),ids=new Set<string>();
  for(const page of d.pages){
    if(!Number.isInteger(page.pdfPage)||page.pdfPage<1||page.pdfPage>d.totalPages||seen.has(page.pdfPage)||!Array.isArray(page.blocks)||!page.blocks.length)throw Error('번역 쪽 정보가 올바르지 않습니다.');
    seen.add(page.pdfPage);
    for(const block of page.blocks){
      if(!block.id||ids.has(block.id)||typeof block.original!=='string'||!block.original.trim()||typeof block.translation!=='string'||!block.translation.trim())throw Error('원문과 번역이 짝을 이루지 않는 문단이 있습니다.');
      ids.add(block.id);
    }
  }
  if(seen.size!==entry.totalPages)throw Error('번역에 빠진 쪽이 있습니다.');
  return {...d,pages:[...d.pages].sort((a,b)=>a.pdfPage-b.pdfPage)};
}
export function translationPageAt(tops:{page:number;top:number}[],position:number):number{
  let result=tops[0]?.page||1;for(const row of tops){if(row.top>position)break;result=row.page;}return result;
}
export function translationNoteText(value:unknown):string{
  if(typeof value==='string')return value;
  if(value&&typeof value==='object'){const row=value as Record<string,unknown>;return [row.note,row.text,row.explanation,row.translation].filter(x=>typeof x==='string').join(' ');}
  return '';
}
