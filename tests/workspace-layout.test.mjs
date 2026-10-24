import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as paneLayout from '../src/four-pane-size.ts';
import * as readingView from '../src/reading-view.ts';
import * as mobileMenu from '../src/mobile-menu-swipe.ts';
const require=createRequire(import.meta.url);
const fixture={meta:{pageCount:279},pages:[],sources:[],notes:[{id:'fn-001',number:1,page:20,text:'각주 원문',sourceRefs:[],clickTargets:[],noteHighlights:[]}]};
const emptyComponent={__esModule:true,default:()=>null};
const source=readFileSync(new URL('../src/review-workspace.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
function renderWorkspace(focus=false,mode='pdf',width=1701,height=849){
 let nullState=0;
 const module={exports:{}};
 const dependencies={
  './four-pane-size':paneLayout,
  './reading-view':readingView,
  './mobile-menu-swipe':mobileMenu,
  './paragraph-catalog.json':{default:{paragraphs:[]}},
  './revision-proposals.json':{default:{items:[]}},
  './proposal-indicators':{buildProposalIndicators:()=>({})},
  './pdf-viewer-model':{footnoteTargets:()=>[]},
  './web-manuscript':{...emptyComponent,default:()=>React.createElement('div',{'data-testid':'current-web-body'}),citationContextWasEdited:()=>false},
  './pdf-viewer':{...emptyComponent,default:()=>React.createElement('div',{'data-testid':'original-pdf'})},
  './parallel-source-reader':{...emptyComponent,translationEntries:[]},
  './citation-model':{citedSourceRefs:()=>[],citedPages:()=>[],citationHighlights:()=>[]},
  './text-size-control':{TextSizeControl:()=>null},
  './document-alignment':{useDocumentAlignment:()=>{}},
 };
 vm.runInNewContext(compiled,{module,exports:module.exports,window:{innerWidth:width,innerHeight:height,localStorage:{getItem:()=>null}},require:id=>{
  if(id==='react')return {...React,useState:initial=>React.useState(initial==='pdf'?mode:initial===readingView.DEFAULT_READING_VIEW?{...initial,focus}:initial===null&&++nullState===1?fixture:initial)};
  if(id in dependencies)return dependencies[id];
  if(id.startsWith('.'))return id.endsWith('.css')?{}:id.endsWith('.json')?{default:{}}:emptyComponent;
  return require(id);
 }});
 return renderToStaticMarkup(React.createElement(module.exports.default));
}
test('review opens with footnote details expanded and accurately named controls',()=>{
 const html=renderWorkspace();
 assert.match(html,/class="review-app four-pane-app mobile-show-thesis metadata-open"/);
 assert.match(html,/aria-controls="reference-metadata" aria-expanded="true"[^>]*>각주 상세정보<\/button>/);
 assert.match(html,/aria-label="각주 상세정보 접기"[^>]*>각주 상세정보 접기<\/button>/);
 assert.match(html,/--document-columns:minmax\(0, 36fr\) 6px minmax\(0, 36fr\) 6px minmax\(0, 28fr\)/);
 assert.ok(html.includes('각주 원문'));
 assert.ok(!html.includes('>각주 정보·수정<'));
});

test('focus uses two reading columns while keeping the detail editor mounted for restoration',()=>{
 const html=renderWorkspace(true);
 assert.match(html,/mobile-show-thesis metadata-collapsed reading-focus view-hide-header view-hide-tools view-hide-footnotes/);
 assert.match(html,/--document-columns:minmax\(0, 50fr\) 6px minmax\(0, 50fr\)/);
 assert.ok(html.includes('id="reference-metadata"'));
 assert.ok(html.includes('각주 원문'),'hidden editor context must remain mounted');
 assert.ok(!html.includes('class="split-divider source-metadata-divider"'));
});

test('focus changes only the surrounding interface and preserves the chosen current body',()=>{
 for(const focus of [false,true]){
  const body=renderWorkspace(focus,'body');
  assert.ok(body.includes('data-testid="current-web-body"'));
  assert.ok(!body.includes('data-testid="original-pdf"'));
  const pdf=renderWorkspace(focus,'pdf');
  assert.ok(pdf.includes('data-testid="original-pdf"'));
  assert.ok(!pdf.includes('data-testid="current-web-body"'));
 }
});
test('short mobile layout removes surrounding chrome without selecting another manuscript or hiding navigation',()=>{
 for(const mode of ['body','pdf']){
  const html=renderWorkspace(false,mode,768,320);
  assert.match(html,/metadata-open view-hide-header view-hide-tools view-hide-footnotes/);
  assert.ok(!html.includes('metadata-open reading-focus'));
  assert.ok(html.includes('class="mobile-navigation"'));
  assert.ok(html.includes(mode==='body'?'data-testid="current-web-body"':'data-testid="original-pdf"'));
 }
});
