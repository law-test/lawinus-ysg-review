export type ReadingSurface='header'|'tools'|'footnotes'|'sidebar'|'metadata';
export type ReadingView={focus:boolean;header:boolean;tools:boolean;footnotes:boolean;focusSurfaces?:Partial<Record<ReadingSurface,boolean>>};
export type ReadingPane='contents'|'thesis'|'source'|'metadata';
export const DEFAULT_READING_VIEW:ReadingView={focus:false,header:true,tools:true,footnotes:true};

export function readingVisibility(view:ReadingView,sidebar:boolean,metadata:boolean){
  const normal={header:view.header,tools:view.tools,footnotes:view.footnotes,sidebar,metadata};
  if(!view.focus)return normal;
  return {header:!!view.focusSurfaces?.header,tools:!!view.focusSurfaces?.tools,footnotes:!!view.focusSurfaces?.footnotes,sidebar:!!view.focusSurfaces?.sidebar,metadata:!!view.focusSurfaces?.metadata};
}
export function readingPane(view:ReadingView,pane:ReadingPane):ReadingPane{
  if(view.focus&&pane==='contents'&&!view.focusSurfaces?.sidebar)return 'thesis';
  if(view.focus&&pane==='metadata'&&!view.focusSurfaces?.metadata)return 'thesis';
  return pane;
}
export function withReadingSurface(view:ReadingView,surface:ReadingSurface,show:boolean):ReadingView{
  if(view.focus)return {...view,focusSurfaces:{...view.focusSurfaces,[surface]:show}};
  return surface==='sidebar'||surface==='metadata'?view:{...view,[surface]:show};
}
export function withReadingFocus(view:ReadingView,focus:boolean):ReadingView{
  const {focusSurfaces,...normal}=view;
  return {...normal,focus};
}
