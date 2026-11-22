import type {ReadingView} from './reading-view';

export type MenuSwipe={pointerId:number;x:number;y:number;time:number};
export function menuSwipeAction(start:MenuSwipe,end:{x:number;y:number;time:number}):'collapse'|'restore'|null {
  const dx=end.x-start.x,dy=end.y-start.y,elapsed=end.time-start.time;
  if(elapsed<0||Math.abs(dy)<24||Math.abs(dy)<Math.abs(dx)*1.5)return null;
  return dy<0?'collapse':'restore';
}

export function mobileReadingView(shortScreen:boolean,regular:ReadingView,override:ReadingView|null):ReadingView {
  if(!shortScreen)return regular;
  if(override)return override;
  return regular.focus?regular:{...regular,header:false,tools:false,footnotes:false};
}
