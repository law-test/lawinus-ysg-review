import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {mergeOfficialCases,officialCaseAssetUrl,officialCaseNotice,officialCaseUrl,judgmentSourceUrl,validateOfficialCases} from '../src/official-case-sources.ts';

const hash='a'.repeat(64);
const first={sourceId:'s-case-existing',caseNumber:'2022다233164',title:'대법원 판결',officialUrl:'https://www.law.go.kr/LSW/precInfoP.do?precSeq=123',assetPath:'official-cases/s-case-existing.txt',coverage:'full',retrievedAt:'2026-10-24',sha256:hash,noteIds:['fn-001','fn-002'],paragraphIds:['P0010']};
const added={...first,sourceId:'s-case-new',caseNumber:'2020다1234',assetPath:'official-cases/s-case-new.txt',noteIds:['fn-002'],newSource:true,coverage:'partial',coverageNote:'이유 일부만 확보'};
const supplement={schemaVersion:1,datasetId:'ysg-20261023',pdfSha256:hash,cases:[first,added]};
const manifest={meta:{pdfSha256:hash,title:'원고'},pages:[{page:1,width:595}],sources:[{id:'s-book',kind:'pdf',available:true,pages:200},{id:'s-case-existing',kind:'text',available:false,noteIds:['fn-001'],cards:[{title:'보존'}],officialUrl:'https://google.com/search'}],notes:[{id:'fn-001',text:'원래 각주',clickTargets:[{rect:[1,2,3,4]}],sourceRefs:[{sourceId:'s-book',targetPage:20},{sourceId:'s-case-existing',finding:'기존 확인',highlightIds:['h1']}]},{id:'fn-002',text:'또 다른 각주',sourceRefs:[]},{id:'fn-003',text:'무관한 각주',sourceRefs:[]}]};

test('official case overlay preserves manuscript, geometry, existing IDs, order and unrelated metadata',()=>{
  const before=JSON.stringify(manifest),input=structuredClone(manifest),merged=mergeOfficialCases(input,supplement,'ysg-20261023');
  assert.equal(JSON.stringify(input),before);
  assert.equal(merged.meta,input.meta);assert.equal(merged.pages,input.pages);
  assert.equal(merged.sources[0],input.sources[0]);assert.equal(merged.notes[2],input.notes[2]);
  assert.deepEqual(merged.sources.map(s=>s.id),['s-book','s-case-existing','s-case-new']);
  assert.equal(merged.sources[1].available,true);assert.equal(merged.sources[1].kind,'text');
  assert.deepEqual(merged.sources[1].verifiedParagraphIds,['P0010']);
  assert.deepEqual(merged.sources[1].cards,input.sources[1].cards);
  for(let i=0;i<input.notes.length;i++)assert.deepEqual({...merged.notes[i],sourceRefs:[]},{...input.notes[i],sourceRefs:[]});
  assert.deepEqual(merged.notes[0].sourceRefs.map(r=>r.sourceId),['s-book','s-case-existing']);
  assert.equal(merged.notes[0].sourceRefs[0],input.notes[0].sourceRefs[0]);
  assert.equal(merged.notes[0].sourceRefs[1].originalEvidence.finding,'기존 확인');
  assert.equal(merged.notes[0].sourceRefs[1].evidenceStatus,'official-case-identity');
  assert.match(merged.notes[0].sourceRefs[1].finding,/공식 판결문/);
  assert.deepEqual(merged.notes[0].sourceRefs[1].highlightIds,['h1']);
  assert.equal(merged.notes[0].sourceRefs[1].officialCaseVerified,true);
  assert.deepEqual(merged.notes[1].sourceRefs.map(r=>r.sourceId),['s-case-existing','s-case-new']);
  assert.deepEqual(mergeOfficialCases(merged,supplement,'ysg-20261023'),merged,'repeated loading must not duplicate sources or references');
});

test('verified mirror copies are identified as copies and link to the checked archive without an official-source claim',()=>{
  const item={...first,officialUrl:undefined,provenance:'mirror',providerName:'학술자료 보존 사이트',sourceUrl:'https://uniset.ca/microstates/clowes.html'};
  assert.equal(validateOfficialCases({...supplement,cases:[item]}).cases[0],item);
  assert.equal(judgmentSourceUrl(item),item.sourceUrl);
  assert.match(officialCaseNotice(item),/보존 사본\(미러\)/);assert.doesNotMatch(officialCaseNotice(item),/공식/);
  const merged=mergeOfficialCases(manifest,{...supplement,cases:[item]},'ysg-20261023');
  assert.equal(merged.sources[1].officialCase.provenance,'mirror');
  assert.equal(merged.sources[1].officialUrl,item.sourceUrl);
  const ref=merged.notes[0].sourceRefs[1];
  assert.equal(ref.officialCaseVerified,false);assert.equal(ref.evidenceStatus,'judgment-mirror-identity');
  assert.doesNotMatch(ref.finding,/공식/);assert.equal(ref.originalEvidence.finding,'기존 확인');
  for(const change of [{providerName:''},{sourceUrl:'https://uniset.ca.evil.example/case'},{sourceUrl:'https://another-mirror.example/case'},{provenance:'other'}])assert.throws(()=>validateOfficialCases({...supplement,cases:[{...item,...change}]}));
});

test('existing foreign case files gain only confirmed links, preserving the original file and availability metadata',()=>{
  const inventory={...supplement,confirmedExistingSourceRefs:[{sourceId:'s-book',noteIds:['fn-001','fn-002'],paragraphIds:['P0020']}]};
  const before=JSON.stringify(manifest),merged=mergeOfficialCases(manifest,inventory,'ysg-20261023');
  assert.equal(JSON.stringify(manifest),before);
  const linked=merged.sources[0];
  assert.equal(linked.available,true);assert.equal(linked.kind,'pdf');assert.equal(linked.pages,200);
  assert.equal(linked.officialCase,undefined,'a checked pre-existing file is not a newly fetched official judgment');
  assert.deepEqual(linked.verifiedParagraphIds,['P0020']);
  assert.equal(merged.notes[0].sourceRefs[0].targetPage,20);
  assert.equal(merged.notes[0].sourceRefs[0].existingCaseVerified,true);
  assert.equal(merged.notes[1].sourceRefs.at(-1).sourceId,'s-book');
  assert.equal(merged.notes[1].sourceRefs.at(-1).evidenceStatus,'confirmed-existing-case-file');
  assert.equal(officialCaseAssetUrl('s-book',inventory,'https://ysg.lawinus.org/'),null,'existing files retain their Storage asset URL');
  assert.deepEqual(mergeOfficialCases(merged,inventory,'ysg-20261023'),merged);
});

test('existing-file additions reject missing files, absent notes, duplicate IDs and malformed paragraph IDs',()=>{
  for(const addition of [{sourceId:'s-not-known',noteIds:[]},{sourceId:'s-case-existing',noteIds:[]},{sourceId:'s-book',noteIds:['fn-999']},{sourceId:'s-book',noteIds:[],paragraphIds:['paragraph-1']}]){
    assert.throws(()=>mergeOfficialCases(manifest,{...supplement,confirmedExistingSourceRefs:[addition]},'ysg-20261023'));
  }
  const link={sourceId:'s-book',noteIds:[]};
  assert.throws(()=>validateOfficialCases({...supplement,confirmedExistingSourceRefs:[link,link]}));
  assert.throws(()=>validateOfficialCases({...supplement,cases:[{...first,paragraphIds:['P0010','P0010']}]}));
});

test('mismatched manuscript, absent note IDs and accidental new source IDs fail instead of mislinking',()=>{
  assert.throws(()=>mergeOfficialCases(manifest,supplement,'other-dataset'));
  assert.throws(()=>mergeOfficialCases({...manifest,meta:{pdfSha256:'b'.repeat(64)}},supplement,'ysg-20261023'));
  assert.throws(()=>mergeOfficialCases(manifest,{...supplement,cases:[{...first,noteIds:['fn-999']}]},'ysg-20261023'));
  assert.throws(()=>mergeOfficialCases(manifest,{...supplement,cases:[{...added,newSource:false}]},'ysg-20261023'));
});

test('only reviewed official hosts, exact local filenames and unique source/note IDs are accepted',()=>{
  assert.equal(validateOfficialCases(supplement),supplement);
  for(const officialUrl of ['https://law.go.kr.evil.example/a','https://evil.example/law.go.kr','http://www.law.go.kr/a','https://user:pass@www.law.go.kr/a','https://www.law.go.kr:8443/a','javascript:alert(1)','https://google.com/search']){
    assert.equal(officialCaseUrl(officialUrl),null,officialUrl);
    assert.throws(()=>validateOfficialCases({...supplement,cases:[{...first,officialUrl}]}));
  }
  for(const officialUrl of ['https://law.go.kr/a','https://www.law.go.kr/a','https://glaw.scourt.go.kr/a','https://www.ccourt.go.kr/a'])assert.ok(officialCaseUrl(officialUrl));
  for(const assetPath of ['../config.json','//evil.example/case.txt','official-cases/other.txt','official-cases/s-case-existing.txt?redirect=1','official-cases/s-case-existing.pdf'])assert.throws(()=>validateOfficialCases({...supplement,cases:[{...first,assetPath}]}));
  assert.throws(()=>validateOfficialCases({...supplement,cases:[first,first]}));
  assert.throws(()=>validateOfficialCases({...supplement,cases:[{...first,noteIds:['fn-001','fn-001']}]}));
  assert.throws(()=>validateOfficialCases({...supplement,cases:[{...first,sourceId:'../private'}]}));
});

test('available partial judgments are explicitly marked and never represented as full text',()=>{
  assert.match(officialCaseNotice(first),/전문 수록/);
  assert.match(officialCaseNotice(added),/일부 수록.*이유 일부만 확보/);
  assert.throws(()=>validateOfficialCases({...supplement,cases:[{...added,coverageNote:''}]}));
  assert.throws(()=>validateOfficialCases({...supplement,cases:[{...first,coverage:'unknown'}]}));
  const source=mergeOfficialCases(manifest,supplement,'ysg-20261023').sources[2];
  assert.equal(source.officialCase.coverage,'partial');assert.equal(source.displayMode,'excerpt');
});

test('unacquired judgments remain visible as missing references and can never resolve to a fake local document',()=>{
  const unavailable={sourceId:'s-case-unacquired',caseNumber:'2019다294466',title:'미확보 판례',reason:'공개 전문을 확보하지 못했습니다.',searchUrl:'https://www.law.go.kr/',noteIds:['fn-003'],paragraphIds:['P0030'],newSource:true};
  const inventory={...supplement,unavailableCaseRefs:[unavailable]},merged=mergeOfficialCases(manifest,inventory,'ysg-20261023');
  const source=merged.sources.at(-1),ref=merged.notes[2].sourceRefs[0];
  assert.equal(source.available,false);assert.equal(source.officialCase,undefined);assert.equal(source.officialUrl,undefined);
  assert.equal(source.searchUrl,'https://www.law.go.kr/');assert.match(source.displayNotice,/전문 미확보/);
  assert.equal(ref.evidenceStatus,'case-fulltext-unavailable');assert.equal(ref.unavailableCaseReference,true);
  assert.equal(officialCaseAssetUrl(source.id,inventory,'https://ysg.lawinus.org/'),null);
  assert.deepEqual(mergeOfficialCases(merged,inventory,'ysg-20261023'),merged);
  assert.throws(()=>mergeOfficialCases(manifest,{...supplement,unavailableCaseRefs:[{...unavailable,sourceId:'s-book',newSource:false}]},'ysg-20261023'),'an acquired file must never be downgraded');
  assert.throws(()=>validateOfficialCases({...supplement,unavailableCaseRefs:[{...unavailable,searchUrl:'https://google.com/search'}]}));
  assert.throws(()=>validateOfficialCases({...supplement,unavailableCaseRefs:[{...unavailable,reason:''}]}));
});

test('local asset selection covers only the reviewed IDs and respects same-origin subdirectory deployments',()=>{
  assert.equal(officialCaseAssetUrl('s-case-existing',supplement,'https://ysg.lawinus.org/'),'https://ysg.lawinus.org/official-cases/s-case-existing.txt');
  assert.equal(officialCaseAssetUrl('s-case-new',supplement,'https://law-test.github.io/lawinus-ysg-review/index.html'),'https://law-test.github.io/lawinus-ysg-review/official-cases/s-case-new.txt');
  for(const id of ['human','thesis','manifest','profile','s-book','s-case-other','../config'])assert.equal(officialCaseAssetUrl(id,supplement,'https://ysg.lawinus.org/'),null);
  assert.throws(()=>officialCaseAssetUrl(first.sourceId,{...supplement,cases:[{...first,assetPath:'https://evil.example/case.txt'}]},'https://ysg.lawinus.org/'));
  assert.throws(()=>officialCaseAssetUrl(first.sourceId,supplement,'file:///C:/private/'));
});

test('every bundled judgment file matches the reviewed hash and contains the cited case number',()=>{
  const inventory=validateOfficialCases(JSON.parse(readFileSync(new URL('../src/official-cases.json',import.meta.url),'utf8')));
  const paragraphIds=new Set(JSON.parse(readFileSync(new URL('../src/paragraph-catalog.json',import.meta.url),'utf8')).paragraphs.map(p=>p.id));
  for(const item of [...inventory.cases,...inventory.confirmedExistingSourceRefs||[],...inventory.unavailableCaseRefs||[]])for(const id of item.paragraphIds||[])assert.ok(paragraphIds.has(id),id+' is a paragraph in this manuscript');
  for(const item of inventory.cases){
    const data=readFileSync(new URL('../public/'+item.assetPath,import.meta.url)),text=data.toString('utf8');
    assert.equal(createHash('sha256').update(data).digest('hex'),item.sha256,item.sourceId);
    assert.ok(text.length>100,item.sourceId+' must contain judgment text');
    assert.ok(text.replace(/\s/g,'').includes(item.caseNumber.replace(/\s/g,'')),item.sourceId+' case identity');
    assert.doesNotMatch(text,/^\s*(?:<!doctype html|<html)/i,'reader stores extracted text, not executable HTML');
  }
});
