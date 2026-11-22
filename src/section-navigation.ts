import {useLayoutEffect,useRef,useState,type RefObject} from 'react';

type Location={page:number;y:number;x:number;heading?:boolean;title?:string};
type Entry={depth:number;position:Location};
const key='lawinusSection15';

export function sectionHref(page:number,y:number){
  return '#section='+page+':'+y;
}

function linkedHeading():Location|undefined{
  const match=/^#section=(\d+):(0(?:\.\d+)?|1(?:\.0+)?)$/.exec(location.hash);
  if(match)return {page:Number(match[1]),y:Number(match[2]),x:0,heading:true};
}

export function useSectionNavigation(host:RefObject<HTMLDivElement|null>,start:number,onPage:(page:number)=>void){
  const [canReturn,setCanReturn]=useState(false);
  const [heading,setHeading]=useState<Location>();
  const localStack=useRef<Location[]>([]);

  function pageElement(page:number){
    if(!Number.isInteger(page))return null;
    return host.current?.querySelector<HTMLElement>(`.paper-page[data-page="${page}"]`);
  }
  function move(where:Location,focus=true){
    const pane=host.current,item=pageElement(where.page);
    if(!pane||!item)return;
    const bounds=item.getBoundingClientRect();
    pane.scrollTop=item.offsetTop+bounds.height*where.y-(where.heading?12:0);
    pane.scrollLeft=bounds.width*where.x;
    onPage(where.page);
    setHeading(where.heading?where:undefined);
    if(focus)item.focus({preventScroll:true});
  }
  function open(fromPage:number,page:number,y:number,title?:string){
    const pane=host.current,origin=pageElement(fromPage);
    if(!pane||!origin||!pageElement(page)||!Number.isFinite(y)||y<0||y>1)return;
    const bounds=origin.getBoundingClientRect();
    if(!bounds.height||!bounds.width)return;
    // Keep the viewport relative to the clicked sheet, including a partially visible sheet.
    const before:Location={page:fromPage,y:(pane.scrollTop-origin.offsetTop)/bounds.height,x:pane.scrollLeft/bounds.width};
    const destination:Location={page,y,x:0,heading:true,title};
    try{
      const depth=history.state?.[key]?.depth||0;
      history.replaceState({...history.state,[key]:{depth,position:before}},'');
      history.pushState({...history.state,[key]:{depth:depth+1,position:destination}},'',sectionHref(page,y));
    }catch{
      localStack.current.push(before);
    }
    setCanReturn(true);
    move(destination);
  }
  function back(){
    const previous=localStack.current.pop();
    if(previous){
      move(previous);
      setCanReturn(localStack.current.length>0||history.state?.[key]?.depth>0);
    }else if(history.state?.[key]?.depth>0){
      history.back();
    }
  }
  useLayoutEffect(()=>{
    const old=history.scrollRestoration;
    history.scrollRestoration='manual';
    function restore(focus:boolean){
      const entry:Entry|undefined=history.state?.[key];
      const where=entry?.position||linkedHeading();
      if(where&&pageElement(where.page))move(where,focus);
      setCanReturn((entry?.depth||0)>0);
    }
    restore(false);
    const onPop=()=>restore(true);
    const onSection=(event:Event)=>{
      const {fromPage,page,y,title}=(event as CustomEvent).detail;
      open(fromPage,page,y,title);
    };
    window.addEventListener('popstate',onPop);
    window.addEventListener('paper:section',onSection);
    return ()=>{
      window.removeEventListener('popstate',onPop);
      window.removeEventListener('paper:section',onSection);
      history.scrollRestoration=old;
    };
  },[start,onPage]);
  return {back,canReturn,heading};
}
