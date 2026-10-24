import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as model from '../src/pdf-viewer-model.ts';

const marker={page:1,rect:[100,100,108,108],noteId:'fn-001',number:1,kind:'body-marker'};
const paragraph={page:1,rect:[60,95,300,115],noteId:'P0001',number:0,kind:'paragraph'};

test('touch and pen may reach a tiny number, while mouse and unknown pointers retain exact targeting',()=>{
  for(const pointer of ['touch','pen'])assert.equal(model.pointerTargetAt([paragraph,marker],114,104,pointer,1,1)?.noteId,'fn-001');
  for(const pointer of ['mouse',''])assert.equal(model.pointerTargetAt([paragraph,marker],114,104,pointer,1,1)?.noteId,'P0001');
  assert.equal(model.pointerTargetAt([marker],114,104,'mouse',1,1),undefined);
});

test('the allowance is at most eight screen pixels, including diagonal distance and independent zoom axes',()=>{
  for(const scale of [.5,1,2]){
    assert.equal(model.pointerTargetAt([marker],108+8/scale,104,'touch',scale,scale)?.noteId,'fn-001');
    assert.equal(model.pointerTargetAt([marker],108+8.01/scale,104,'touch',scale,scale),undefined);
  }
  assert.equal(model.pointerTargetAt([marker],114,114,'touch',1,1),undefined,'diagonal corners must not form a larger square allowance');
  assert.equal(model.pointerTargetAt([marker],104,124,'pen',2,.5)?.noteId,'fn-001');
  assert.equal(model.pointerTargetAt([marker],104,124.02,'pen',2,.5),undefined);
  for(const scale of [0,-1,NaN,Infinity])assert.equal(model.pointerTargetAt([marker],114,104,'touch',scale,1),undefined);
});

test('an exact other note or explanation line takes priority over every nearby number and overlapping paragraph',()=>{
  const line={page:1,rect:[110,100,300,110],noteId:'fn-002',number:2,kind:'footnote-text'};
  const tinyParagraph={...paragraph,rect:[113,103,115,105]};
  assert.equal(model.pointerTargetAt([marker,line,tinyParagraph],114,104,'touch',1,1)?.noteId,'fn-002');
  const other={...marker,noteId:'fn-003',number:3,rect:[111,101,116,109],kind:'footnote-marker'};
  assert.equal(model.pointerTargetAt([marker,other],114,104,'pen',1,1)?.noteId,'fn-003');
});

test('different equidistant notes stay unselected, duplicates of the same note remain one candidate',()=>{
  const other={...marker,noteId:'fn-002',number:2,rect:[120,100,128,108]};
  assert.equal(model.pointerTargetAt([paragraph,marker,other],114,104,'touch',1,1),undefined);
  assert.equal(model.pointerTargetAt([paragraph,other,marker],114.1,104,'touch',1,1),undefined,'subpixel ambiguity must not depend on input order');
  assert.equal(model.pointerTargetAt([marker,{...marker}],114,104,'touch',1,1)?.noteId,'fn-001');
  assert.equal(model.pointerTargetAt([marker,other],112,104,'touch',1,1)?.noteId,'fn-001');
});

test('ordinary paragraph and footnote-line blank areas are not enlarged',()=>{
  const line={...marker,kind:'footnote-text'};
  assert.equal(model.pointerTargetAt([line],114,104,'touch',1,1),undefined);
  assert.equal(model.pointerTargetAt([paragraph],50,104,'touch',1,1),undefined);
  assert.equal(model.pointerTargetAt([paragraph,marker],250,104,'touch',1,1)?.noteId,'P0001');
});

const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../src/pdf-viewer.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source+'\nexport {PdfPage as TestPdfPage};',{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
function harness({scale=.5,placing=false}={}){
  const opened=[],placed=[];let selection=null;
  const fakeReact={...React,useRef:current=>({current}),useState:initial=>[initial&&initial.width===515?{width:595,height:841}:initial,()=>{}],useEffect(){},useLayoutEffect(){},useMemo:fn=>fn(),useCallback:fn=>fn};
  const module={exports:{}};
  const dependencies={'react':fakeReact,'./review-api':{assetUrl:()=>''},'./pdf-viewer-model':model,'./pdf-quick-controls':()=>null,'./proposal-indicators':{pageProposalMarkers:()=>[],placeProposalMarkers:()=>[],proposalLabel:()=>''}};
  vm.runInNewContext(compiled,{module,exports:module.exports,require:id=>Object.hasOwn(dependencies,id)?dependencies[id]:id.endsWith('.css')?{}:require(id),window:{getSelection:()=>selection}});
  const tree=module.exports.TestPdfPage({doc:{},runtime:{},page:1,width:595*scale,height:841*scale,highlights:[],targets:[paragraph,marker],pins:[],onTarget:id=>opened.push(id),onPlace:(...args)=>placed.push(args),placing,onSize(){},proposalIndicators:{},bibliographyIds:new Set()});
  tree.props.ref.current={getBoundingClientRect:()=>({left:10,top:20,width:595*scale,height:841*scale}),contains:node=>node==='selected'};
  const event=(x=114,y=104,pointerType='touch')=>({clientX:10+x*scale,clientY:20+y*scale,pointerType,target:{closest:()=>null},currentTarget:tree.props.ref.current,shiftKey:false});
  return {props:tree.props,event,opened,placed,setSelection:value=>selection=value};
}

test('the real page handler remembers touch or pen when the subsequent click lacks pointerType and converts zoom',()=>{
  for(const scale of [.5,1,2])for(const pointer of ['touch','pen','mouse']){
    const h=harness({scale}),e=h.event(108+6/scale,104,pointer);h.props.onPointerDown(e);
    const click={...e};delete click.pointerType;h.props.onClick(click);
    assert.deepEqual(h.opened,[pointer==='mouse'?'P0001':'fn-001']);
  }
});

test('the real page handler suppresses moved, returned, cancelled, shift and selected-text gestures',()=>{
  for(const scenario of ['moved','returned','cancelled','shift','selection']){
    const h=harness(),start=h.event();h.props.onPointerDown(start);let click=start;
    if(scenario==='moved'||scenario==='returned'){h.props.onPointerMove(h.event(154));click=scenario==='moved'?h.event(154):start;}
    if(scenario==='cancelled')h.props.onPointerCancel();
    if(scenario==='shift')click={...start,shiftKey:true};
    if(scenario==='selection')h.setSelection({isCollapsed:false,anchorNode:'selected',focusNode:'selected'});
    h.props.onClick(click);assert.deepEqual(h.opened,[],scenario);
  }
});

test('memo placement and explicit overlay buttons bypass nearby-number selection',()=>{
  const h=harness({placing:true}),e=h.event();h.props.onPointerDown(e);h.props.onClick(e);
  assert.equal(h.placed.length,1);assert.deepEqual(h.opened,[]);
  const overlay=harness(),click=overlay.event();click.target.closest=()=>({tagName:'BUTTON'});overlay.props.onPointerDown(click);overlay.props.onClick(click);assert.deepEqual(overlay.opened,[]);
});
