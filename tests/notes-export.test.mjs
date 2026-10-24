import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import {prepareNotesExport} from '../src/review-api.ts';

const note={id:'00000000-0000-4000-8000-000000000001',datasetId:'ysg-20261023',anchorType:'source',page:null,noteId:'fn-093',sourceId:'s-fixture',x:null,y:null,quote:'인용, "문장"\r\n다음 줄',text:'한글 日本語 😀\n둘째 줄',visibility:'private',status:'open',revision:1,displayName:'방문자 000001',createdAt:'2026-10-24T00:00:00Z',updatedAt:'2026-10-24T00:00:00Z',editable:true};
test('prepared CSV keeps its full UTF-8 blob available until explicitly disposed',async()=>{
 const file=prepareNotesExport([note],'csv',note.datasetId);
 assert.equal(file.fileName,'paper-review-ysg-20261023.csv');assert.equal(file.count,1);assert.equal(file.format,'csv');assert.equal(file.mime,'text/csv;charset=utf-8');
 const bytes=new Uint8Array(await (await fetch(file.url)).arrayBuffer());assert.deepEqual([...bytes.slice(0,3)],[239,187,191]);
 const text=new TextDecoder().decode(bytes);assert.ok(text.includes('"인용, ""문장""\r\n다음 줄"'));assert.ok(text.includes('한글 日本語 😀\n둘째 줄'));
 assert.ok((await fetch(file.url)).ok,'link can be activated again without regenerating');
 file.dispose();file.dispose();await assert.rejects(()=>fetch(file.url));
});
test('empty exports still prepare a CSV header without invented rows',async()=>{
 const file=prepareNotesExport([],'csv','ysg-20261023');assert.equal(file.count,0);
 const text=await (await fetch(file.url)).text();assert.equal(text.split('\r\n').length,1);assert.match(text,/"기준본","메모ID"/);file.dispose();
});

const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../src/notes-export.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const states=[],refs=[],effects=[],requests=[],disposals=[];let stateIndex=0,refIndex=0,mounted=false,setCalls=0;
 const module={exports:{}};
 const api=format=>new Promise((resolve,reject)=>requests.push({format,resolve,reject}));
 vm.runInNewContext(compiled,{module,exports:module.exports,Error,require:id=>id==='react'?{...React,useState:initial=>{const i=stateIndex++;if(!(i in states))states[i]=initial;return[states[i],value=>{setCalls++;states[i]=value;}];},useRef:initial=>{const i=refIndex++;return refs[i]??=( {current:initial} );},useEffect:fn=>{if(!mounted)effects.push(fn);}}:id==='./review-api'?{exportNotes:api}:id.endsWith('.css')?{}:require(id)});
 let cleanups=[];
 function render(){stateIndex=0;refIndex=0;const tree=module.exports.default();if(!mounted){mounted=true;cleanups=effects.map(fn=>fn());}const nodes=[];function walk(n){if(!n||typeof n!=='object')return;nodes.push(n);React.Children.forEach(n.props?.children,walk);}walk(tree);return nodes;}
 const text=n=>React.Children.toArray(n.props.children).filter(x=>typeof x==='string'||typeof x==='number').join('');
 function button(label){return render().find(n=>n.type==='button'&&text(n)===label);}
 function file(format='csv',count=1){const n=disposals.length;disposals.push(0);return{url:`blob:fixture-${n}`,fileName:`paper-review-ysg-20261023.${format}`,mime:format==='csv'?'text/csv;charset=utf-8':'text/markdown;charset=utf-8',format,count,dispose(){disposals[n]++;}};}
 return{render,button,requests,file,disposals,cleanup:()=>cleanups.forEach(fn=>fn?.()),setCalls:()=>setCalls};
}
test('preparing prevents duplicate requests and presents an explicit download link without claiming saved',async()=>{
 const h=harness();const click=h.button('Excel용 CSV ↓').props.onClick;click();click();assert.equal(h.requests.length,1);assert.equal(h.requests[0].format,'csv');
 assert.ok(h.render().filter(n=>n.type==='button').every(n=>n.props.disabled));assert.ok(h.render().some(n=>n.props.role==='status'));
 const file=h.file();h.requests[0].resolve(file);await flush();const nodes=h.render(),link=nodes.find(n=>n.type==='a');
 assert.equal(link.props.href,file.url);assert.equal(link.props.download,file.fileName);assert.equal(React.Children.toArray(link.props.children).join(''),'CSV 파일 저장');assert.equal(link.props.onClick,undefined);
 assert.ok(!nodes.filter(n=>n.type==='button').some(n=>n.props.disabled));assert.deepEqual(h.disposals,[0]);
 const text=JSON.stringify(nodes.map(n=>n.props.children),(_key,value)=>typeof value==='function'?undefined:value);assert.ok(text.includes('준비했습니다'));assert.ok(!text.includes('저장했습니다'));
});
test('new preparation releases the previous link and failed preparation offers a retry without stale file',async()=>{
 const h=harness();h.button('Excel용 CSV ↓').props.onClick();h.requests[0].resolve(h.file());await flush();
 h.button('Markdown ↓').props.onClick();assert.deepEqual(h.disposals,[1]);assert.ok(!h.render().some(n=>n.type==='a'));
 h.requests[1].reject(new Error('시험: 메모 전체를 확보하지 못했습니다.'));await flush();const nodes=h.render();assert.match(nodes.find(n=>n.props.role==='alert').props.children,/전체를 확보/);assert.ok(nodes.filter(n=>n.type==='button').every(n=>!n.props.disabled));
 h.button('Excel용 CSV ↓').props.onClick();assert.equal(h.requests.length,3);h.requests[2].resolve(h.file());await flush();assert.ok(h.render().some(n=>n.type==='a'));assert.ok(!h.render().some(n=>n.props.role==='alert'));
});
test('leaving the memo panel releases the available export URL',async()=>{
 const h=harness();h.button('Excel용 CSV ↓').props.onClick();h.requests[0].resolve(h.file());await flush();h.render();h.cleanup();assert.deepEqual(h.disposals,[1]);
});
test('a result finishing after the panel unmounts is released without updating the closed panel',async()=>{
 const h=harness();h.button('Excel용 CSV ↓').props.onClick();h.cleanup();const calls=h.setCalls();h.requests[0].resolve(h.file());await flush();assert.deepEqual(h.disposals,[1]);assert.equal(h.setCalls(),calls);
});
