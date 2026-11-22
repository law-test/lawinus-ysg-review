/** A glossary link addresses a physical PDF page, independently of printed folios. */
export function initialPaperPage(search:string,bodyStartPage:number,pageCount:number){
  const fallback=Math.max(1,Math.min(bodyStartPage||1,pageCount));
  const values=new URLSearchParams(search).getAll('paperPage');
  if(values.length!==1||!/^\d{1,3}$/.test(values[0]))return fallback;
  const requested=Number(values[0]);
  return requested>=1&&requested<=pageCount?requested:fallback;
}
