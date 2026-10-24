export type FourPaneCuts={thesis:number;sourceEnd:number};
export const DEFAULT_FOUR_PANE_CUTS:FourPaneCuts={thesis:36,sourceEnd:72};
export const DEFAULT_COLLAPSED_SPLIT=50;
export const PANE_LAYOUT_STORAGE_KEY='paper-equal-document-layout-v1';
type StoredPaneLayout={cuts:FourPaneCuts;collapsedSplit:number};
const finite=(n:unknown,fallback:number)=>typeof n==='number'&&Number.isFinite(n)?n:fallback;
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));

/** Positions of the two document dividers, excluding the navigation sidebar. */
export function normalizeFourPaneCuts(value:unknown):FourPaneCuts{
  const row=value&&typeof value==='object'?value as Partial<FourPaneCuts>:{};
  const thesis=clamp(finite(row.thesis,DEFAULT_FOUR_PANE_CUTS.thesis),22,60);
  const sourceEnd=clamp(finite(row.sourceEnd,DEFAULT_FOUR_PANE_CUTS.sourceEnd),thesis+20,80);
  return {thesis,sourceEnd};
}
export function moveFourPaneBoundary(cuts:FourPaneCuts,boundary:'thesis'|'source',value:number):FourPaneCuts{
  const current=normalizeFourPaneCuts(cuts);
  return boundary==='thesis'
    ?{...current,thesis:clamp(finite(value,current.thesis),22,current.sourceEnd-20)}
    :{...current,sourceEnd:clamp(finite(value,current.sourceEnd),current.thesis+20,80)};
}
export function fourPaneColumns(cuts:FourPaneCuts):string{
  const {thesis,sourceEnd}=normalizeFourPaneCuts(cuts);
  return `minmax(0, ${thesis}fr) 6px minmax(0, ${sourceEnd-thesis}fr) 6px minmax(0, ${100-sourceEnd}fr)`;
}

/** Keep the wider reading layout separate from the saved editing layout. */
export function normalizeCollapsedSplit(value:unknown):number{
  return clamp(finite(value,DEFAULT_COLLAPSED_SPLIT),28,72);
}
export function collapsedPaneColumns(value:unknown):string{
  const thesis=normalizeCollapsedSplit(value);
  return `minmax(0, ${thesis}fr) 6px minmax(0, ${100-thesis}fr)`;
}
export function equalDocumentCuts(cuts:FourPaneCuts):FourPaneCuts{
  const sourceEnd=Math.max(44,normalizeFourPaneCuts(cuts).sourceEnd);
  return {thesis:sourceEnd/2,sourceEnd};
}
/** A new key resets the former unequal defaults once, then preserves later drags. */
export function readPaneLayout(storage?:Pick<Storage,'getItem'>):StoredPaneLayout{
  const fallback={cuts:{...DEFAULT_FOUR_PANE_CUTS},collapsedSplit:DEFAULT_COLLAPSED_SPLIT};
  try{
    const saved=storage?.getItem(PANE_LAYOUT_STORAGE_KEY);
    if(!saved)return fallback;
    const row=JSON.parse(saved);
    if(!row||row.version!==1)return fallback;
    return {cuts:normalizeFourPaneCuts(row.cuts),collapsedSplit:normalizeCollapsedSplit(row.collapsedSplit)};
  }catch{return fallback;}
}
export function savePaneLayout(storage:Pick<Storage,'setItem'>,cuts:FourPaneCuts,collapsedSplit:number):void{
  try{storage.setItem(PANE_LAYOUT_STORAGE_KEY,JSON.stringify({version:1,cuts:normalizeFourPaneCuts(cuts),collapsedSplit:normalizeCollapsedSplit(collapsedSplit)}));}catch{}
}
