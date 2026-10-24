export function requestedPdfPage(value:string,total:number):number|null {
  if(!value.trim())return null;
  const page=Number(value),last=Math.max(1,Math.trunc(total)||1);
  if(!Number.isFinite(page))return null;
  return Math.min(last,Math.max(1,Math.trunc(page)));
}

export function steppedPdfZoom(zoom:number,direction:-1|1):number {
  return Math.round(Math.min(2,Math.max(.7,zoom+direction*.15))*100)/100;
}
