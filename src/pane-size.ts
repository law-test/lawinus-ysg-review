export function clampPaneSize(value:number,min:number,max:number){
  return Math.min(Math.max(min,max),Math.max(min,Number.isFinite(value)?value:min));
}

export function draggedPaneSize(startValue:number,startX:number,currentX:number,unitsPerPixel:number,min:number,max:number){
  return clampPaneSize(startValue+(currentX-startX)*unitsPerPixel,min,max);
}

export function keyboardPaneSize(key:string,value:number,min:number,max:number,step:number):number|null{
  if(key==='Home')return min;
  if(key==='End')return max;
  if(key==='ArrowLeft')return clampPaneSize(value-step,min,max);
  if(key==='ArrowRight')return clampPaneSize(value+step,min,max);
  return null;
}
