import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file){
  const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(output,{module,exports:module.exports,URL,require:id=>load(id.replace('./','')+'.ts')});
  return module.exports;
}
const {sourceExternalUrl,sourceDocumentUrl,preferredSourceRef,excerptPageLabel}=load('source-navigation.ts');
const sources=[{id:'missing',kind:'text',available:false},{id:'full',kind:'pdf',pages:20,available:true},{id:'excerpt',kind:'pdf',pages:11,available:true}];
const note={id:'fn-001',sourceRefs:sources.map(s=>({sourceId:s.id}))};
const map={'fn-001':{excerpt:{basis:'직접 확인',pages:[{page:5,printed:'258'}]}}};

test('a verified available citation precedes available files and missing references without reordering the list',()=>{
  const before=JSON.stringify({sources,note,map});
  assert.equal(preferredSourceRef(note,map,sources).sourceId,'excerpt');
  assert.equal(preferredSourceRef(note,{},sources).sourceId,'full');
  assert.equal(preferredSourceRef(note,{},[sources[0]]).sourceId,'missing');
  assert.equal(JSON.stringify({sources,note,map}),before);
  assert.equal(preferredSourceRef({id:'empty'},{},sources),undefined);
});

test('explicit reader choices survive selection, while missing files and invalid pages do not win automatic selection',()=>{
  assert.equal(preferredSourceRef(note,map,sources,'missing').sourceId,'missing');
  assert.equal(preferredSourceRef(note,map,sources,'full').sourceId,'full');
  const invalid={'fn-001':{excerpt:{pages:[{page:99,printed:'258'}]},missing:{pages:[{page:1,printed:'1'}]}}};
  assert.equal(preferredSourceRef(note,invalid,sources).sourceId,'full');
  assert.equal(preferredSourceRef(note,map,sources,'unknown').sourceId,'excerpt');
  assert.equal(preferredSourceRef({id:'fn-001',sourceRefs:[{sourceId:'missing'}]},map,sources).sourceId,'excerpt','citation-only verified references remain eligible');
});

test('unavailable sources never resolve to storage and unsafe or absent external links stay hidden',()=>{
  const calls=[],asset=id=>{calls.push(id);return '/storage/'+id;};
  assert.equal(sourceDocumentUrl({id:'missing',available:false,officialUrl:'https://example.org/case?q=1'},asset),'https://example.org/case?q=1');
  for(const officialUrl of [undefined,'javascript:alert(1)','data:text/html,test','//example.org','https://']){
    assert.equal(sourceDocumentUrl({id:'missing',available:false,officialUrl},asset),null);
  }
  assert.deepEqual(calls,[]);
  assert.equal(sourceExternalUrl({officialUrl:'invalid',searchUrl:'https://example.org/search'}),'https://example.org/search');
  assert.equal(sourceDocumentUrl({id:'full',available:true,officialUrl:'https://example.org'},asset),'/storage/full');
  assert.deepEqual(calls,['full']);
  assert.equal(sourceDocumentUrl(undefined,asset),null);
});

test('excerpt labels distinguish served page, printed folio and original PDF without guessing absent folios',()=>{
  assert.equal(excerptPageLabel({pages:11,pageMap:[{page:5,originalPage:300,printedPages:['258']}]},5),'발췌 5/11쪽 · 인쇄 258면 · 원본 PDF 300쪽');
  assert.equal(excerptPageLabel({pages:4,pageMap:[{servedPage:2,originalPage:481,printedPages:['474','475면']}]},2),'발췌 2/4쪽 · 인쇄 474면, 475면 · 원본 PDF 481쪽');
  assert.equal(excerptPageLabel({pages:4,pageMap:[{page:1,originalPage:1,printedPages:[]}]},1),'발췌 1/4쪽 · 인쇄면 미확인 · 원본 PDF 1쪽');
  assert.equal(excerptPageLabel({pages:4},3),'발췌 3/4쪽 · 인쇄면 미확인 · 원본 PDF 쪽수 미확인');
});

test('workspace uses the same resolver in source captions and preserves manual note choices',()=>{
  const source=readFileSync(new URL('../src/review-workspace.tsx',import.meta.url),'utf8');
  assert.match(source,/sourceHref=sourceDocumentUrl\(source,assetUrl\)/);
  assert.doesNotMatch(source,/href=\{assetUrl\(sourceId\)\}/);
  assert.match(source,/sourceChoices\.current\[active\]=id/);
  assert.match(source,/sourceChoices\.current\[id\]/);
  assert.match(source,/excerptPageLabel\(source,sourcePage\)/);
});
