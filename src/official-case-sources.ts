export type OfficialCase = {
  sourceId: string;
  caseNumber: string;
  title: string;
  officialUrl?: string;
  sourceUrl?: string;
  provenance?: 'official'|'mirror';
  providerName?: string;
  assetPath: string;
  kind?: 'text'|'pdf';
  pages?: number;
  coverage: 'full'|'partial';
  coverageNote?: string;
  retrievedAt: string;
  sha256: string;
  noteIds: string[];
  paragraphIds?: string[];
  newSource?: boolean;
};
export type ConfirmedExistingCaseRefs = {sourceId:string;noteIds:string[];paragraphIds?:string[]};
export type UnavailableCaseRefs = ConfirmedExistingCaseRefs&{title:string;caseNumber:string;reason:string;searchUrl:string;newSource?:boolean};
export type OfficialCaseSupplement = {
  schemaVersion: 1;
  datasetId: string;
  pdfSha256: string;
  cases: OfficialCase[];
  confirmedExistingSourceRefs?: ConfirmedExistingCaseRefs[];
  unavailableCaseRefs?: UnavailableCaseRefs[];
};
type Source = {id:string;noteIds?:string[];[key:string]:any};
type Note = {id:string;sourceRefs?:{sourceId:string;[key:string]:any}[];[key:string]:any};
type Manifest = {meta:{pdfSha256?:string;[key:string]:any};sources:Source[];notes:Note[];[key:string]:any};
const sourceIdPattern = /^s-[A-Za-z0-9_-]{1,100}$/;
const shaPattern = /^[a-f0-9]{64}$/;
const supportedDatasets = new Set(['ysg-20261023', 'ysg-20261024']);
const validIds=(ids:unknown,pattern:RegExp):ids is string[]=>Array.isArray(ids)&&ids.every(id=>typeof id==='string'&&pattern.test(id))&&new Set(ids).size===ids.length;

export function officialCaseUrl(value:unknown):string|null {
  if(typeof value!=='string')return null;
  try {
    const url=new URL(value);
    const official=url.hostname==='taxlaw.nts.go.kr'||['law.go.kr','scourt.go.kr','ccourt.go.kr'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host));
    return official&&url.protocol==='https:'&&!url.username&&!url.password&&!url.port?url.href:null;
  } catch { return null; }
}

export function judgmentSourceUrl(item:OfficialCase):string|null {
  if(item.provenance!=='mirror')return officialCaseUrl(item.officialUrl);
  if(typeof item.sourceUrl!=='string')return null;
  try {
    const url=new URL(item.sourceUrl);
    // These specific archives were checked while acquiring the judgment copies.
    const archive=['rivistataf.eu','www.rivistataf.eu','trusts.it','www.trusts.it','uniset.ca','www.uniset.ca','taxcanvas.kr','www.taxcanvas.kr','lawcafe24.com','www.lawcafe24.com','lbox.kr','casenote.kr'].includes(url.hostname);
    const protocol=url.protocol==='https:'||url.protocol==='http:'&&['lawcafe24.com','www.lawcafe24.com'].includes(url.hostname);
    return archive&&protocol&&!url.username&&!url.password&&!url.port?url.href:null;
  } catch {return null;}
}

function officialSearchUrl(value:unknown):string|null {
  const korean=officialCaseUrl(value);if(korean)return korean;
  if(typeof value!=='string')return null;
  try{const url=new URL(value);return ['courts.go.jp','www.courts.go.jp'].includes(url.hostname)&&url.protocol==='https:'&&!url.username&&!url.password&&!url.port?url.href:null;}catch{return null;}
}

export function validateOfficialCases(value:unknown):OfficialCaseSupplement {
  const v=value as OfficialCaseSupplement;
  if(!v||v.schemaVersion!==1||!supportedDatasets.has(v.datasetId)||!shaPattern.test(v.pdfSha256)||!Array.isArray(v.cases))throw new Error('공식 판례 목록의 기준본이 올바르지 않습니다.');
  const ids=new Set<string>();
  for(const item of v.cases) {
    if(!item||!sourceIdPattern.test(item.sourceId)||ids.has(item.sourceId)
      ||item.assetPath!==`official-cases/${item.sourceId}.${item.kind==='pdf'?'pdf':'txt'}`
      ||item.kind!==undefined&&!['text','pdf'].includes(item.kind)
      ||(item.kind==='pdf'?(!Number.isInteger(item.pages)||item.pages!<1||item.pages!>5000):item.pages!==undefined)
      ||typeof item.caseNumber!=='string'||!item.caseNumber.trim()||item.caseNumber.length>100
      ||typeof item.title!=='string'||!item.title.trim()
      ||!judgmentSourceUrl(item)||!shaPattern.test(item.sha256)
      ||item.provenance!==undefined&&!['official','mirror'].includes(item.provenance)
      ||item.provenance==='mirror'&&(typeof item.providerName!=='string'||!item.providerName.trim())
      ||!/^\d{4}-\d{2}-\d{2}$/.test(item.retrievedAt)
      ||!['full','partial'].includes(item.coverage)
      ||item.coverage==='partial'&&(typeof item.coverageNote!=='string'||!item.coverageNote.trim())
      ||!validIds(item.noteIds,/^fn-\d{3}$/)
      ||item.paragraphIds!==undefined&&!validIds(item.paragraphIds,/^P\d{4}$/)
      ||item.newSource!==undefined&&typeof item.newSource!=='boolean'
      ||item.newSource&&!item.sourceId.startsWith('s-case-'))throw new Error('공식 판례의 출처·파일·연결 정보가 올바르지 않습니다.');
    ids.add(item.sourceId);
  }
  if(v.confirmedExistingSourceRefs!==undefined&&!Array.isArray(v.confirmedExistingSourceRefs))throw new Error('기존 판례 연결 목록이 올바르지 않습니다.');
  for(const item of v.confirmedExistingSourceRefs||[]) {
    if(!item||!sourceIdPattern.test(item.sourceId)||ids.has(item.sourceId)||!validIds(item.noteIds,/^fn-\d{3}$/)
      ||item.paragraphIds!==undefined&&!validIds(item.paragraphIds,/^P\d{4}$/))throw new Error('기존 판례의 식별자·연결 정보가 올바르지 않습니다.');
    ids.add(item.sourceId);
  }
  if(v.unavailableCaseRefs!==undefined&&!Array.isArray(v.unavailableCaseRefs))throw new Error('미확보 판례 목록이 올바르지 않습니다.');
  for(const item of v.unavailableCaseRefs||[]) {
    if(!item||!sourceIdPattern.test(item.sourceId)||ids.has(item.sourceId)||!validIds(item.noteIds,/^fn-\d{3}$/)
      ||item.paragraphIds!==undefined&&!validIds(item.paragraphIds,/^P\d{4}$/)
      ||typeof item.title!=='string'||!item.title.trim()||typeof item.caseNumber!=='string'||!item.caseNumber.trim()
      ||typeof item.reason!=='string'||!item.reason.trim()||!officialSearchUrl(item.searchUrl)
      ||item.newSource!==undefined&&typeof item.newSource!=='boolean'||item.newSource&&!item.sourceId.startsWith('s-case-'))throw new Error('미확보 판례의 연결·안내 정보가 올바르지 않습니다.');
    ids.add(item.sourceId);
  }
  return v;
}

// Only exact, reviewed document paths in the bundled inventory can bypass Storage.
// The source ID is unchanged, so existing source memos retain their anchors.
export function officialCaseAssetUrl(id:string,supplement:OfficialCaseSupplement,baseUrl:string):string|null {
  const item=supplement.cases.find(entry=>entry.sourceId===id);
  if(!item)return null;
  if(!sourceIdPattern.test(id)||item.kind!==undefined&&!['text','pdf'].includes(item.kind)||item.assetPath!==`official-cases/${id}.${item.kind==='pdf'?'pdf':'txt'}`)throw new Error('허용되지 않은 판례 파일 경로입니다.');
  const base=new URL(baseUrl),url=new URL('./'+item.assetPath,base);
  if(!['https:','http:'].includes(base.protocol)||url.origin!==base.origin)throw new Error('허용되지 않은 판례 파일 주소입니다.');
  return url.href;
}

export function officialCaseNotice(item:OfficialCase):string {
  return (item.provenance==='mirror'?(item.coverage==='full'?'판결문 전문 보존 사본(미러)':'판결문 일부 보존 사본(미러)'):(item.coverage==='full'?'공식 판결문 전문 수록':'공식 판결문 일부 수록'))
    +(item.provenance==='mirror'?' · '+item.providerName:'')
    +(item.coverageNote?' · '+item.coverageNote:'')+' · 수집 '+item.retrievedAt;
}

function preserveEvidence(ref:Record<string,any>) {
  if(ref.originalEvidence)return ref.originalEvidence;
  return Object.fromEntries(['scope','finding','limit','evidenceStatus','locatorStatus','locatorMessage'].filter(key=>Object.hasOwn(ref,key)).map(key=>[key,ref[key]]));
}

// This is a display-only overlay. Do not mutate the downloaded manifest, prose,
// geometry, or any database row; retain all unrelated source/reference fields.
export function mergeOfficialCases<T extends Manifest>(manifest:T,supplement:OfficialCaseSupplement,datasetId:string):T {
  validateOfficialCases(supplement);
  if(datasetId!==supplement.datasetId||manifest.meta?.pdfSha256!==supplement.pdfSha256)throw new Error('판례 연결 목록과 논문 기준본이 다릅니다.');
  const sourceIds=new Set(manifest.sources.map(source=>source.id)),noteIds=new Set(manifest.notes.map(note=>note.id));
  for(const item of supplement.cases) {
    if(!sourceIds.has(item.sourceId)&&!item.newSource)throw new Error('기존 판례 자료의 식별자를 확인할 수 없습니다.');
    if(item.noteIds.some(id=>!noteIds.has(id)))throw new Error('판례가 연결된 각주를 확인할 수 없습니다.');
  }
  const existingRefs=supplement.confirmedExistingSourceRefs||[];
  for(const item of existingRefs) {
    const source=manifest.sources.find(candidate=>candidate.id===item.sourceId);
    if(!source||source.available===false)throw new Error('연결할 기존 판례 원문을 확인할 수 없습니다.');
    if(item.noteIds.some(id=>!noteIds.has(id)))throw new Error('기존 판례가 연결된 각주를 확인할 수 없습니다.');
  }
  const unavailableRefs=supplement.unavailableCaseRefs||[];
  for(const item of unavailableRefs) {
    const source=manifest.sources.find(candidate=>candidate.id===item.sourceId);
    if(!source&&!item.newSource||source&&source.available!==false)throw new Error('미확보 판례가 기존 원문을 대체할 수 없습니다.');
    if(item.noteIds.some(id=>!noteIds.has(id)))throw new Error('미확보 판례의 각주를 확인할 수 없습니다.');
  }
  const byId=new Map(supplement.cases.map(item=>[item.sourceId,item]));
  const withCase=(source:Source,item:OfficialCase):Source=>({
    ...source,title:item.title,kind:item.kind||'text',available:true,pages:item.kind==='pdf'?item.pages:null,officialUrl:judgmentSourceUrl(item),
    displayMode:item.coverage==='full'?'fulltext':'excerpt',displayNotice:officialCaseNotice(item),
    noteIds:[...new Set([...(source.noteIds||[]),...item.noteIds])],
    verifiedParagraphIds:[...new Set([...(source.verifiedParagraphIds||[]),...(item.paragraphIds||[])])],
    officialCase:{caseNumber:item.caseNumber,coverage:item.coverage,coverageNote:item.coverageNote||'',provenance:item.provenance||'official',providerName:item.providerName||'',retrievedAt:item.retrievedAt,sha256:item.sha256},
  });
  const byExistingId=new Map(existingRefs.map(item=>[item.sourceId,item]));
  const sources=manifest.sources.map(source=>{
    if(byId.has(source.id))return withCase(source,byId.get(source.id)!);
    const item=byExistingId.get(source.id);
    return item?{...source,noteIds:[...new Set([...(source.noteIds||[]),...item.noteIds])],verifiedParagraphIds:[...new Set([...(source.verifiedParagraphIds||[]),...(item.paragraphIds||[])])]}:source;
  });
  for(const item of supplement.cases)if(!sourceIds.has(item.sourceId))sources.push(withCase({id:item.sourceId,cards:[],locators:[],highlights:[]},item));
  for(const item of unavailableRefs) {
    const index=sources.findIndex(source=>source.id===item.sourceId),previous=index>=0?sources[index]:{id:item.sourceId};
    const source={...previous,title:item.title,available:false,kind:'text',pages:null,officialUrl:undefined,searchUrl:officialSearchUrl(item.searchUrl),displayNotice:'판결문 전문 미확보 · '+item.reason,
      unavailableCase:{caseNumber:item.caseNumber,reason:item.reason},noteIds:[...new Set([...(previous.noteIds||[]),...item.noteIds])],verifiedParagraphIds:[...new Set([...(previous.verifiedParagraphIds||[]),...(item.paragraphIds||[])])]};
    if(index>=0)sources[index]=source;else sources.push(source);
  }
  const notes=manifest.notes.map(note=>{
    const cases=supplement.cases.filter(item=>item.noteIds.includes(note.id));
    const existing=existingRefs.filter(item=>item.noteIds.includes(note.id));
    const unavailable=unavailableRefs.filter(item=>item.noteIds.includes(note.id));
    if(!cases.length&&!existing.length&&!unavailable.length)return note;
    const sourceRefs=[...(note.sourceRefs||[])];
    for(const item of cases) {
      const index=sourceRefs.findIndex(ref=>ref.sourceId===item.sourceId);
      const verified={officialCaseVerified:item.provenance!=='mirror',caseIdentityVerified:true,caseSourceUrl:judgmentSourceUrl(item),officialCaseNumber:item.caseNumber,
        scope:'각주에 인용된 판례',finding:item.provenance==='mirror'?'인용된 판례와 사건 정보가 일치하는 판결문 보존 사본을 연결했습니다.':'사건번호가 일치하는 공식 판결문을 연결했습니다.',
        limit:item.coverage==='partial'?item.coverageNote:'정확한 인용 대목은 판결문 본문에서 확인해 주세요.',evidenceStatus:item.provenance==='mirror'?'judgment-mirror-identity':'official-case-identity',locatorStatus:item.kind==='pdf'?'exact-page-unconfirmed':'not-paginated',locatorMessage:item.kind==='pdf'?'판결문 열람용 PDF입니다. 정확한 인용면은 본문에서 확인해 주세요.':'텍스트로 수록한 판결문입니다. 인용된 대목을 본문에서 확인해 주세요.'};
      if(index>=0)sourceRefs[index]={...sourceRefs[index],...(sourceRefs[index].caseIdentityVerified?{}:{originalEvidence:preserveEvidence(sourceRefs[index])}),...verified};
      else sourceRefs.push({sourceId:item.sourceId,...verified,highlightIds:[]});
    }
    for(const item of existing) {
      const index=sourceRefs.findIndex(ref=>ref.sourceId===item.sourceId);
      const verified={existingCaseVerified:true,scope:'각주에 인용된 판례',finding:'인용된 판례에 대응하는 기존 보유 원문을 연결했습니다.',limit:'정확한 인용면은 원문에서 확인해 주세요.',evidenceStatus:'confirmed-existing-case-file'};
      if(index>=0)sourceRefs[index]={...sourceRefs[index],...(sourceRefs[index].existingCaseVerified?{}:{originalEvidence:preserveEvidence(sourceRefs[index])}),...verified};
      else sourceRefs.push({sourceId:item.sourceId,...verified,highlightIds:[],locatorStatus:'exact-page-unconfirmed'});
    }
    for(const item of unavailable) {
      const index=sourceRefs.findIndex(ref=>ref.sourceId===item.sourceId);
      const fields={unavailableCaseReference:true,scope:'각주에 인용된 판례',finding:'판례 인용은 확인했으나 판결문 전문을 확보하지 못했습니다.',limit:item.reason,evidenceStatus:'case-fulltext-unavailable',locatorStatus:'unavailable',locatorMessage:'공식 검색 사이트에서 사건번호로 확인할 수 있습니다. 검색 결과나 해설은 판결문 전문을 대신하지 않습니다.'};
      if(index>=0)sourceRefs[index]={...sourceRefs[index],...(sourceRefs[index].unavailableCaseReference?{}:{originalEvidence:preserveEvidence(sourceRefs[index])}),...fields};
      else sourceRefs.push({sourceId:item.sourceId,...fields,highlightIds:[]});
    }
    return {...note,sourceRefs};
  });
  return {...manifest,sources,notes};
}
