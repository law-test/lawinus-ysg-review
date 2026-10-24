import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as paneLayout from '../src/four-pane-size.ts';
import * as readingView from '../src/reading-view.ts';
import * as mobileMenu from '../src/mobile-menu-swipe.ts';
const require=createRequire(import.meta.url);
const compile=file=>ts.transpileModule(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
function loadReadingModel(){const module={exports:{}};vm.runInNewContext(compile('web-manuscript.tsx'),{module,exports:module.exports,require:id=>id.startsWith('.')?{}:require(id)});return module.exports;}
const readingModel=loadReadingModel();
const bibliographyData=JSON.parse(readFileSync(new URL('../src/bibliography-links.json',import.meta.url),'utf8'));
const realParagraphs=JSON.parse(readFileSync(new URL('../src/paragraph-catalog.json',import.meta.url),'utf8')).paragraphs;
const realSources=JSON.parse(readFileSync(new URL('./fixtures/bibliography-sources.json',import.meta.url),'utf8')).sources;
const paragraphs=[{id:'P0283',text:'원문[^1]',page:20,printed:1,heading:false,kind:'paragraph',rects:[],order:283}];
paragraphs.push(...realParagraphs.filter(p=>['P0825','P0823','P0843','P0901'].includes(p.id)));
const proposal={id:'P0283',page:20,page_end:86,priority:'권고',before:'원문[^1]',after:'수정문[^1]',reason:'수정 이유',applyText:'수정문[^1]'};
const fixture={meta:{pageCount:211},pages:[],sources:[{id:'source-1',kind:'pdf',title:'원전',pages:220}],notes:[{id:'fn-001',number:1,page:20,text:'각주 원문',sourceRefs:[{sourceId:'source-1'}],clickTargets:[],noteHighlights:[]}]};
const bibliographySourceIds=Object.values(bibliographyData.entries).flatMap(e=>[...e.sourceIds,...e.candidateSourceIds]);
fixture.sources.push(...realSources.filter(s=>bibliographySourceIds.includes(s.id)));
function PdfPane(){return null;}function WebManuscript(){return null;}function SharedEditEditor(){return null;}
const empty={__esModule:true,default:()=>null};
function harness(mode='pdf'){
 const states=[],refs=[];let stateIndex=0,refIndex=0,nullCount=0,oneCount=0,effects=[],tree;
 const module={exports:{}};
 const dependencies={
  './four-pane-size':paneLayout,'./reading-view':readingView,'./mobile-menu-swipe':mobileMenu,
  './review-api':{assetUrl:id=>'https://example.invalid/'+id},
  './paragraph-catalog.json':{default:{paragraphs}},'./revision-proposals.json':{default:{items:[proposal]}},
  './bibliography-links.json':{default:bibliographyData},
  './thesis-toc-data.json':{default:{entries:[{kind:'body',page:12}]}},
  './proposal-indicators':{buildProposalIndicators:()=>({})},'./pdf-viewer-model':{footnoteTargets:()=>[]},
  './web-manuscript':{...readingModel,__esModule:true,default:WebManuscript},'./pdf-viewer':{__esModule:true,default:PdfPane},
  './shared-edit-editor':{__esModule:true,default:SharedEditEditor},'./parallel-source-reader':{...empty,translationEntries:[]},
  './citation-model':{citedSourceRefs:note=>note.sourceRefs||[],citedPages:()=>[],citationHighlights:()=>[],citationStartPage:()=>27},
  './source-navigation':{sourceDocumentUrl:(source,assetUrl)=>source?.id?assetUrl(source.id):null,sourceExternalUrl:()=>null,preferredSourceRef:note=>note.sourceRefs?.[0],excerptPageLabel:()=>''},
  './text-size-control':{TextSizeControl:()=>null},'./document-alignment':{useDocumentAlignment:()=>{}},
 };
 vm.runInNewContext(compile('review-workspace.tsx'),{module,exports:module.exports,window:{innerWidth:390,innerHeight:844,localStorage:{getItem:()=>null}},require:id=>{
  if(id==='react')return {...React,useState:initial=>{
   const index=stateIndex++;if(!(index in states)){let value=typeof initial==='function'?initial():initial;if(initial===null&&++nullCount===1)value=fixture;if(initial==='pdf')value=mode;if(initial===12)value=86;if(initial===1)value=++oneCount===1?1.6:29;states[index]=value;}
   return [states[index],next=>{states[index]=typeof next==='function'?next(states[index]):next;}];
  },useRef:initial=>{const index=refIndex++;return refs[index]??=( {current:initial});},useMemo:fn=>fn(),useEffect:(fn,deps)=>effects.push({fn,deps})};
  if(id in dependencies)return dependencies[id];if(id.startsWith('.'))return id.endsWith('.css')?{}:id.endsWith('.json')?{default:{}}:empty;return require(id);
 }});
 function render(){stateIndex=0;refIndex=0;effects=[];tree=module.exports.default();return tree;}
 function nodes(){const all=[];function walk(node){if(!node||typeof node!=='object')return;all.push(node);React.Children.forEach(node.props?.children,walk);}walk(tree);return all;}
 const label=node=>React.Children.toArray(node.props?.children).map(c=>typeof c==='object'?label(c):String(c)).join('');
 function pollView(){const effect=effects.find(e=>e.deps?.length===2&&e.deps[0]===fixture);assert.ok(effect);effect.fn();render();}
 render();return {render,nodes,label,pollView,pdf:()=>nodes().find(n=>n.type===PdfPane&&n.props.id==='thesis'),body:()=>nodes().find(n=>n.type===WebManuscript),editor:kind=>nodes().find(n=>n.type===SharedEditEditor&&n.props.kind===kind)};
}
const edit=(kind,text,revision=3)=>({id:String(revision+10),kind,targetId:kind==='paragraph'?'P0283':'fn-001',revision,text});

test('saving a footnote preserves the current PDF page, zoom and selected original through the next poll',()=>{
 const h=harness();
 const sourceButton=h.nodes().find(n=>n.type==='button'&&h.label(n)==='1. 원전');assert.ok(sourceButton);sourceButton.props.onClick();h.render();
 let source=h.nodes().find(n=>n.type===PdfPane&&n.props.id==='source-1');assert.ok(source);source.props.onPageChange(29);source.props.onZoomChange(1.3);h.render();
 h.editor('footnote').props.onSaved(edit('footnote','수정한 각주'));h.render();h.pollView();
 assert.equal(h.pdf().props.page,86);assert.equal(h.pdf().props.zoom,1.6);assert.equal(h.body(),undefined);
 source=h.nodes().find(n=>n.type===PdfPane&&n.props.id==='source-1');assert.equal(source.props.page,29);assert.equal(source.props.zoom,1.3);
 assert.equal(h.editor('footnote').props.current.revision,3);
});
test('saving while reading the current body updates its text without changing its page or zoom',()=>{
 const h=harness('body');h.body().props.onProposal('P0283');h.render();
 h.editor('paragraph').props.onSaved(edit('paragraph','새 본문[^1]'));h.render();h.pollView();
 assert.equal(h.body().props.page,86);assert.equal(h.body().props.zoom,1.6);assert.equal(h.body().props.overrides.P0283.text,'새 본문[^1]');assert.equal(h.pdf(),undefined);
});
test('a proposal badge on a continuation page opens editing without jumping back to its first page',()=>{
 for(const mode of ['pdf','body']){const h=harness(mode);(h.pdf()||h.body()).props.onProposal('P0283');h.render();assert.equal((h.pdf()||h.body()).props.page,86);assert.equal(h.editor('paragraph').props.targetId,'P0283');assert.match(h.render().props.className,/mobile-show-metadata/);}
});
test('selecting a proposal from the list still explicitly navigates to its first page',()=>{
 const h=harness();const menu=h.nodes().find(n=>n.type==='button'&&h.label(n)==='✎수정안');assert.ok(menu);menu.props.onClick();h.render();
 const item=h.nodes().find(n=>n.type==='button'&&h.label(n).includes('원문[^1]'));assert.ok(item);item.props.onClick();h.render();assert.equal(h.pdf().props.page,20);
});
test('restoring an original footnote keeps its revision for future saves without forcing body mode',()=>{
 const h=harness();h.editor('footnote').props.onSaved(edit('footnote','각주 원문',4));h.render();h.pollView();
 assert.equal(h.pdf().props.page,86);assert.equal(h.body(),undefined);assert.equal(h.editor('footnote').props.current.revision,4);
});

test('bibliography targets open the available original in both manuscript views and retain a separate editor',()=>{
 for(const mode of ['pdf','body']){
  const h=harness(mode),sourceId=bibliographyData.entries.P0825.sourceIds[0];
  const view=h.pdf()||h.body();(mode==='pdf'?view.props.onTarget:view.props.onParagraph)('P0825');h.render();
  assert.ok(h.nodes().some(n=>n.type===PdfPane&&n.props.id===sourceId));
  assert.match(h.render().props.className,/mobile-show-source/);
  assert.equal((h.pdf()||h.body()).props.page,86);
  const editButton=h.nodes().find(n=>n.type==='button'&&h.label(n)==='참고문헌 문안 수정');assert.ok(editButton);
  editButton.props.onClick();h.render();assert.equal(h.editor('paragraph').props.targetId,'P0825');
 }
});
test('missing bibliography originals are explained and uncertain candidates are never automatically selected',()=>{
 for(const id of ['P0823','P0843','P0901']){
  const h=harness();h.pdf().props.onTarget(id);h.render();
  assert.match(h.render().props.className,/mobile-show-metadata/);
  assert.equal(h.nodes().filter(n=>n.type===PdfPane&&n.props.id!=='thesis').length,0);
  assert.ok(h.nodes().some(n=>n.type==='button'&&h.label(n)==='참고문헌 문안 수정'));
  const content=h.label(h.render());
  assert.match(content,id==='P0901'?/동일 문헌인지는 확인이 필요/:/원문 파일/);
  if(id==='P0901')assert.ok(h.nodes().some(n=>n.type==='button'&&h.label(n).startsWith('연결 후보: ')));
 }
});

test('opening an unrelated source memo clears the previous bibliography citation and edit target',()=>{
 const h=harness();h.pdf().props.onTarget('P0825');h.render();
 assert.ok(h.nodes().some(n=>n.props?.className==='citation-card bibliography-card'));
 h.pdf().props.onPin({id:'memo-source-other',anchorType:'source',noteId:null,sourceId:'source-1',page:42,x:null,y:null,text:'다른 원전의 메모',quote:'',visibility:'private',status:'open',revision:1,displayName:'검수',createdAt:'2026-10-24T00:00:00Z',editable:true});h.render();
 const source=h.nodes().find(n=>n.type===PdfPane&&n.props.id==='source-1');assert.ok(source);assert.equal(source.props.page,42);
 assert.equal(h.nodes().filter(n=>n.props?.className==='citation-card bibliography-card').length,0);
 assert.equal(h.nodes().filter(n=>n.type==='button'&&h.label(n)==='참고문헌 문안 수정').length,0);
 assert.equal(h.pdf().props.page,86);
});
