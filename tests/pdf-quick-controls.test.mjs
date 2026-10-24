import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {requestedPdfPage,steppedPdfZoom} from '../src/pdf-quick-tools-model.ts';

const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../src/pdf-quick-controls.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(){
 const states=[],refs=[],effectDeps=[];let stateIndex=0,refIndex=0,effectIndex=0,effects=[];
 const pageCalls=[],zoomCalls=[],handCalls=[];
 const fakeReact={...React,useState:initial=>{const index=stateIndex++;if(!(index in states))states[index]=initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},useRef:initial=>refs[refIndex++]??(refs[refIndex-1]={current:initial}),useEffect:(fn,deps)=>{const index=effectIndex++;if(!effectDeps[index]||deps.some((value,i)=>value!==effectDeps[index][i])){effectDeps[index]=deps;effects.push(fn);}}};
 const module={exports:{}};
 vm.runInNewContext(compiled,{module,exports:module.exports,require:id=>id==='react'?fakeReact:id==='./pdf-quick-tools-model'?{requestedPdfPage,steppedPdfZoom}:id.endsWith('.css')?{}:require(id),window:{addEventListener(){},removeEventListener(){}}});
 let props={id:'thesis',label:'박사논문',page:5,total:279,zoom:1,hand:true,onPageChange:p=>pageCalls.push(p),onZoomChange:z=>zoomCalls.push(z),onHandChange:h=>handCalls.push(h)};
 function render(overrides={}){props={...props,...overrides};stateIndex=0;refIndex=0;effectIndex=0;effects=[];const tree=module.exports.default(props);for(const effect of effects)effect();const all=[];function walk(node){if(!node||typeof node!=='object')return;all.push(node);React.Children.forEach(node.props?.children,walk);}walk(tree);return {tree,all,html:renderToStaticMarkup(tree)};}
 return {render,pageCalls,zoomCalls,handCalls};
}

test('quick controls stay closed and do not use document height until requested',()=>{
 const h=harness(),closed=h.render();assert.equal(closed.all.some(n=>n.props?.role==='dialog'),false);
 assert.equal(closed.all.find(n=>n.props?.className==='pdf-quick-trigger').props['aria-expanded'],false);
 closed.all.find(n=>n.props?.className==='pdf-quick-trigger').props.onClick();
 const open=h.render();assert.equal(open.all.find(n=>n.props?.role==='dialog').props['aria-label'],'박사논문 보기 도구');
 assert.deepEqual(h.pageCalls,[]);assert.deepEqual(h.zoomCalls,[]);
});

test('small-screen visible label is short while its accessible document name stays specific',()=>{
 const h=harness();
 for(const label of ['박사논문','참고문헌']){
  const current=h.render({label}),button=current.all.find(n=>n.props?.className==='pdf-quick-trigger');
  assert.equal(button.props['aria-label'],label+' 쪽 이동과 확대 도구');
  assert.equal(current.all.find(n=>n.props?.className==='pdf-quick-label-short').props.children,'도구');
  assert.equal(current.all.find(n=>n.props?.className==='pdf-quick-label-short').props['aria-hidden'],'true');
 }
 const css=readFileSync(new URL('../src/pdf-quick-controls.css',import.meta.url),'utf8');
 assert.ok(css.includes('.pdf-quick-label-short{display:none}'));
 assert.ok(css.includes('@media(max-width:480px){.pdf-quick-label-full{display:none}.pdf-quick-label-short{display:inline}}'));
 assert.deepEqual(h.pageCalls,[]);assert.deepEqual(h.zoomCalls,[]);
});

test('page entry survives a continuous-scroll page update and submits only explicitly',()=>{
 const h=harness();h.render().all.find(n=>n.props?.className==='pdf-quick-trigger').props.onClick();
 let current=h.render(),input=current.all.find(n=>n.type==='input');input.props.onFocus();input.props.onChange({target:{value:'123'}});
 h.render({page:8});current=h.render();input=current.all.find(n=>n.type==='input');assert.equal(input.props.value,'123');
 input.props.onBlur();assert.deepEqual(h.pageCalls,[]);
 current.all.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.deepEqual(h.pageCalls,[123]);
});

test('zoom and hand tools use the existing viewer state without navigating',()=>{
 const h=harness();h.render().all.find(n=>n.props?.className==='pdf-quick-trigger').props.onClick();
 const current=h.render();current.all.find(n=>n.props?.['aria-label']==='박사논문 확대').props.onClick();
 current.all.find(n=>n.props?.['aria-pressed']===false).props.onClick();
 assert.deepEqual(h.zoomCalls,[1.15]);assert.deepEqual(h.handCalls,[false]);assert.deepEqual(h.pageCalls,[]);
});

test('Escape closes the popover without changing the selected page or zoom',()=>{
 const h=harness();h.render().all.find(n=>n.props?.className==='pdf-quick-trigger').props.onClick();
 h.render().tree.props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){}});
 assert.equal(h.render().all.some(n=>n.props?.role==='dialog'),false);assert.deepEqual(h.pageCalls,[]);assert.deepEqual(h.zoomCalls,[]);
});

test('invalid page entries do not cause jumps and valid entries stay within the source',()=>{
 assert.equal(requestedPdfPage('',279),null);assert.equal(requestedPdfPage('x',279),null);assert.equal(requestedPdfPage('Infinity',279),null);
 assert.equal(requestedPdfPage('999',48),48);assert.equal(requestedPdfPage('-4',48),1);assert.equal(requestedPdfPage('18.7',48),18);
 assert.equal(steppedPdfZoom(.7,-1),.7);assert.equal(steppedPdfZoom(2,1),2);
});

test('compact controls preserve font scaling, touch targets, and overlay-only layout',()=>{
 const css=readFileSync(new URL('../src/pdf-quick-controls.css',import.meta.url),'utf8');
 assert.ok(css.includes('var(--review-font-scale,1.5)'));assert.ok(css.includes('min-height:44px'));
 assert.ok(css.includes('position:absolute;inset:0'));assert.ok(css.includes('max-width:calc(100% - 16px)'));
 const workspace=readFileSync(new URL('../src/review-workspace.tsx',import.meta.url),'utf8');
 assert.equal((workspace.match(/quickTools=\{compact\|\|!visibleSurfaces.tools\}/g)||[]).length,2);
 assert.ok(!workspace.includes('readingSplit'));assert.ok(!workspace.includes('readingFocus='));
});
