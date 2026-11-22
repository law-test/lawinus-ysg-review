import data from './thesis-folios.json';

type Folio = {page:number;label:string;kind:string};
const pages:Folio[]=data.pages;
const byLabel=new Map(pages.map(folio=>[folio.label.normalize('NFKC').toLowerCase(),folio.page]));

export const lastPrintedFolio=pages[pages.length-1].label;

export function folioLabel(sheet:number){
  return pages[sheet-1]?.label??'';
}

export function folioDescription(sheet:number){
  const folio=pages[sheet-1];
  return !folio?'':folio.kind==='unnumbered'?folio.label:folio.label+'쪽';
}

export function sheetForFolio(input:string){
  const text=input.normalize('NFKC').trim().replace(/(?:쪽|면)\s*$/u,'').trim().toLowerCase();
  const key=/^[0-9]+$/u.test(text)?String(Number(text)):text;
  return byLabel.get(key);
}
