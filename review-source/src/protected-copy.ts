import spacingData from './copy-space-map.json' with {type:'json'};
import {restoreCopySpacing,type CopySpacing} from './copy-spacing.ts';

export const COPY_EDITION='ysg-20261121';
const spacing=spacingData as Record<string,Record<string,CopySpacing>>;

export function protectedCopyLine(text:string,page:number,index:number,edition:string,sourceId?:string){
  if(sourceId||edition!==COPY_EDITION||!Number.isInteger(page)||page<1||!Number.isInteger(index)||index<0)return {text};
  return restoreCopySpacing(text,spacing[page]?.[index]);
}

type CopyEvent={currentTarget:HTMLElement;clipboardData:Pick<DataTransfer,'setData'>;preventDefault:()=>void};
// Clip to the selected characters, then join only the manuscript's selected
// lines. Reference documents and selections outside this pane keep native copy.
export function copyProtectedSelection(event:CopyEvent){
  if(event.currentTarget.dataset.copyEdition!==COPY_EDITION)return;
  const selection=window.getSelection();
  if(!selection||selection.isCollapsed||!selection.rangeCount)return;
  const range=selection.getRangeAt(0);
  if(!event.currentTarget.contains(range.commonAncestorContainer))return;
  const output:string[]=[];
  for(const span of event.currentTarget.querySelectorAll<HTMLElement>('.protected-copy-line')){
    if(span.dataset.copyEdition!==COPY_EDITION||!range.intersectsNode(span))continue;
    const clipped=document.createRange();clipped.selectNodeContents(span);
    if(range.compareBoundaryPoints(Range.START_TO_START,clipped)>0)clipped.setStart(range.startContainer,range.startOffset);
    if(range.compareBoundaryPoints(Range.END_TO_END,clipped)<0)clipped.setEnd(range.endContainer,range.endOffset);
    let value=clipped.toString();if(!value)continue;
    if(output.length){
      const candidate=span.dataset.joinBefore;
      const join=candidate!==undefined&&/^\s*$/.test(candidate)?candidate:'\n';
      if(join===' '||join===''){output[output.length-1]=output[output.length-1].trimEnd();value=value.trimStart();}
      output.push(join);
    }
    output.push(value);
  }
  if(!output.length)return;
  event.clipboardData.setData('text/plain',output.join(''));event.preventDefault();
}
