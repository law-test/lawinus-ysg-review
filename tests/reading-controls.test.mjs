import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as readingView from '../src/reading-view.ts';
import * as menuSwipe from '../src/mobile-menu-swipe.ts';
const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../src/reading-controls.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
function renderControl(view,menuOpen=false,mobile=false,pane='source'){
 const changed=[],panelChanges=[],widthChanges=[];
 const module={exports:{}};
 vm.runInNewContext(compiled,{module,exports:module.exports,require:id=>id==='react'?{...React,useState:initial=>[menuOpen||initial,()=>{}],useEffect:()=>{},useRef:initial=>({current:initial})}:id==='./reading-view'?readingView:id==='./mobile-menu-swipe'?menuSwipe:require(id)});
 const tree=module.exports.default({view,onChange:v=>changed.push(v),sidebar:true,metadata:true,mobile,pane,onSidebar:v=>panelChanges.push(v),onMetadata:v=>panelChanges.push(v),document:'source',onEqualWidth:()=>widthChanges.push('equal'),onDocument:()=>{throw Error('Reading view must not switch documents');}});
 const all=[],labels=[];function walk(node){if(!node||typeof node!=='object')return;if(node.type==='button')all.push(node);if(node.type==='label')labels.push(node);React.Children.forEach(node.props?.children,walk);}walk(tree);
 return {html:renderToStaticMarkup(tree),buttons:all,labels,changed,panelChanges,widthChanges};
}
test('direct collapse is reachable without opening the view options',()=>{
 const normal={...readingView.DEFAULT_READING_VIEW,tools:false,footnotes:false};
 const result=renderControl(normal);
 assert.ok(result.html.includes('메뉴 접기'));
 assert.ok(!result.html.includes('id="reading-view-options"'));
 const direct=result.buttons.find(b=>b.props.className==='reading-collapse-toggle');
 assert.equal(direct.props['aria-expanded'],true);
 direct.props.onClick();
 assert.deepEqual(result.changed,[{...normal,focus:true}]);
 assert.deepEqual(result.panelChanges,[]);
 assert.equal(normal.focus,false);
});
test('one-click restore preserves every original menu preference and document selection',()=>{
 const normal={...readingView.DEFAULT_READING_VIEW,header:false,tools:false};
 const result=renderControl(readingView.withReadingFocus(normal,true));
 assert.ok(result.html.includes('메뉴 펼치기'));
 const direct=result.buttons.find(b=>b.props.className==='reading-collapse-toggle');
 assert.equal(direct.props['aria-expanded'],false);
 direct.props.onClick();
 assert.deepEqual(result.changed,[normal]);
 assert.deepEqual(result.panelChanges,[]);
});


test('reading focus retains common-edit connection errors and retry controls',()=>{
 const css=readFileSync(new URL('../src/reading-controls.css',import.meta.url),'utf8');
 const hiddenSelectors=[...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].filter(m=>/display\s*:\s*none/.test(m[2])).map(m=>m[1]);
 assert.ok(hiddenSelectors.every(s=>!s.includes('.shared-edit-status')&&!s.includes('.app-error')));
});

test('equal width is an explicit menu action available with the other tools hidden',()=>{
 const normal={...readingView.DEFAULT_READING_VIEW,header:false,tools:false};
 const result=renderControl(readingView.withReadingFocus(normal,true),true);
 assert.ok(result.html.includes('논문·원전 같은 폭'));
 assert.deepEqual(result.widthChanges,[]);
 result.buttons.find(b=>b.props.className==='reading-equal-width').props.onClick();
 assert.deepEqual(result.widthChanges,['equal']);
 assert.deepEqual(result.changed,[]);
 assert.deepEqual(result.panelChanges,[]);
});

function pointer(overrides={}){return {pointerId:1,isPrimary:true,pointerType:'touch',clientX:20,clientY:80,timeStamp:0,currentTarget:{setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){}},...overrides};}
test('mobile menu swipe collapses once and suppresses its synthetic click',()=>{
 const view={...readingView.DEFAULT_READING_VIEW,tools:false};const result=renderControl(view,false,true),button=result.buttons.find(b=>b.props.className==='reading-collapse-toggle');
 button.props.onPointerDown(pointer());button.props.onPointerMove(pointer({clientY:30,timeStamp:100}));button.props.onPointerUp(pointer({clientY:20,timeStamp:160}));
 let prevented=false;button.props.onClick({detail:1,preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.deepEqual(result.changed,[{...view,focus:true}]);assert.deepEqual(result.panelChanges,[]);
 assert.ok(result.html.includes('data-mobile-swipe="true"'));assert.ok(result.html.includes('mobile-swipe-hint'));
});
test('downward swipe restores the original preferences and does not switch document',()=>{
 const normal={...readingView.DEFAULT_READING_VIEW,header:false,footnotes:false};const result=renderControl(readingView.withReadingFocus(normal,true),false,true),button=result.buttons.find(b=>b.props.className==='reading-collapse-toggle');
 button.props.onPointerDown(pointer({clientY:20}));button.props.onPointerMove(pointer({clientY:65,timeStamp:80}));button.props.onPointerUp(pointer({clientY:65,timeStamp:130}));assert.deepEqual(result.changed,[normal]);
});
test('desktop mouse dragging, cancelled touch, and a second touch do not change menus',()=>{
 for(const scenario of ['mouse','cancel','secondary']){
  const result=renderControl(readingView.DEFAULT_READING_VIEW,false,scenario!=='mouse'),button=result.buttons.find(b=>b.props.className==='reading-collapse-toggle');
  button.props.onPointerDown(pointer({pointerType:scenario==='mouse'?'mouse':'touch'}));
  if(scenario==='cancel')button.props.onPointerCancel();
  if(scenario==='secondary')button.props.onPointerDown(pointer({isPrimary:false,pointerId:2}));
  button.props.onPointerUp(pointer({clientY:10,timeStamp:100}));assert.deepEqual(result.changed,[]);
  if(scenario!=='mouse'){button.props.onClick({detail:1,preventDefault(){}});assert.deepEqual(result.changed,[]);}
 }
});
test('a mouse on a narrow screen can use the dedicated menu gesture without changing documents',()=>{
 const view={...readingView.DEFAULT_READING_VIEW};const result=renderControl(view,false,true),button=result.buttons.find(b=>b.props.className==='reading-collapse-toggle');
 button.props.onPointerDown(pointer({pointerType:'mouse'}));button.props.onPointerMove(pointer({pointerType:'mouse',clientY:14,timeStamp:9000}));button.props.onPointerUp(pointer({pointerType:'mouse',clientY:14,timeStamp:9100}));
 assert.deepEqual(result.changed,[{...view,focus:true}]);assert.deepEqual(result.panelChanges,[]);
});

function surfaceInput(result,text){const label=result.labels.find(node=>React.Children.toArray(node.props.children).includes(text));return React.Children.toArray(label.props.children).find(node=>typeof node==='object'&&node.type==='input');}
test('mobile pane checks follow the visible tab and open a hidden panel with one selection',()=>{
 const normal={...readingView.DEFAULT_READING_VIEW};const result=renderControl(normal,true,true,'thesis');
 assert.equal(surfaceInput(result,'목차').props.checked,false);
 assert.equal(surfaceInput(result,'각주 상세정보').props.checked,false);
 surfaceInput(result,'각주 상세정보').props.onChange({target:{checked:true}});
 assert.deepEqual(result.panelChanges,[true]);assert.deepEqual(result.changed,[]);
 const details=renderControl(normal,true,true,'metadata');
 assert.equal(surfaceInput(details,'각주 상세정보').props.checked,true);
 assert.equal(surfaceInput(details,'목차').props.checked,false);
 assert.equal(details.buttons.filter(b=>b.props['aria-pressed']===true).length,0,'no document is shown while the metadata tab is selected');
});
test('mobile tab changes override stale focus panel flags without altering desktop pane preferences',()=>{
 const focused={...readingView.DEFAULT_READING_VIEW,focus:true,focusSurfaces:{sidebar:true,metadata:true}};
 const mobile=renderControl(focused,true,true,'source');
 assert.equal(surfaceInput(mobile,'목차').props.checked,false);
 assert.equal(surfaceInput(mobile,'각주 상세정보').props.checked,false);
 const contents=renderControl(focused,true,true,'contents');assert.equal(surfaceInput(contents,'목차').props.checked,true);
 const desktop=renderControl(readingView.DEFAULT_READING_VIEW,true,false,'source');
 assert.equal(surfaceInput(desktop,'목차').props.checked,true);
 assert.equal(surfaceInput(desktop,'각주 상세정보').props.checked,true);
 assert.deepEqual(desktop.panelChanges,[]);
});
