import {LAW_VERSIONS} from './law-index';
import verified from './verified-law-targets.json';
import type {PageTarget} from './page-text';

type Edition={key:string;name:string;status:string;effectiveDate?:string;officialUrl?:string;currentKey?:string|null};
type LawPatch=Partial<PageTarget>&{label:string;id?:string};
const metadata=verified as {
  extraEditions:Edition[];
  anchors:Record<string,string[]>;
  overrides:Record<string,LawPatch>;
  additions?:Record<string,PageTarget[]>;
  positions?:Record<string,number[]>;
};
export const readerLawEditions:Edition[]=[...LAW_VERSIONS,...metadata.extraEditions];
export const isPublicLawEdition=(key:string)=>metadata.extraEditions.some(edition=>edition.key===key);

function officialArticle(edition:Edition,id:string){
  const [article,subarticle='0']=id.split('-');
  const joNo=article.padStart(4,'0'),joBrNo=subarticle.padStart(2,'0');
  const params=new URLSearchParams({lsiSeq:edition.key.slice(3),efYd:edition.effectiveDate||'',chrClsCd:'010202',joNo,joBrNo});
  return 'https://www.law.go.kr/LSW/lsInfoR.do?'+params+'#Y'+joNo+joBrNo;
}

export function repairLawTargets(page:number,targets:PageTarget[]):PageTarget[]{
  const amended=targets.map((raw,index)=>{
    if(raw.kind!=='law')return raw;
    const location=page+'/'+index;
    const span=metadata.positions?.[location];
    const original=span?{...raw,noteNumber:span[0],start:span[1],end:span[2]}:raw;
    const candidate=metadata.overrides[location];
    const patch=candidate?.label===original.label?candidate:undefined;
    let target=original;
    if(patch){
      // A reassigned citation must not retain the old destination or its quoted text.
      target={...original,url:undefined,articleText:undefined,...patch,articleId:patch.id??patch.articleId};
      if(patch.kind==='note')return target;
    }
    let key=target.lawKey;
    if(!key&&target.url){
      try{const u=new URL(target.url);const seq=u.searchParams.get('lsiSeq');if(u.hostname==='www.law.go.kr'&&seq)key='kr-'+seq;}catch{}
    }
    const edition=readerLawEditions.find(entry=>entry.key===key);
    if(!edition)return target;
    const match=((target.label||'')+' '+(target.title||'')).match(/제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/);
    const id=target.articleId||(match?match[1]+(match[2]?'-'+match[2]:''):'');
    if(!id)return target;
    const hasArticle=!!key&&metadata.anchors[key]?.includes(id);
    if(!hasArticle&&!patch)return target;
    return {...target,lawKey:key,articleId:id,title:patch?.title||(patch?edition.name+' '+target.label:target.title),
      status:patch?.status||edition.status,url:hasArticle?officialArticle(edition,id):target.url};
  });
  return [...amended,...(metadata.additions?.[page]||[])];
}
