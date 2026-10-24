import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
function load(file){
  const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(output,{module,exports:module.exports,require:id=>id.endsWith('.css')?{}:id==='./proposal-indicators'?load('proposal-indicators.ts'):require(id)});
  return module.exports;
}
const {default:WebManuscript,manuscriptModeAfterRefresh,citationContextWasEdited,effectiveManuscriptEdits}=load('web-manuscript.tsx');
const paragraphs=[{id:'P0001',text:'원문[^1]',page:12,printed:1,kind:'paragraph',heading:false,order:1,rects:[]}];
const notes=[{id:'fn-001',number:1,page:12,text:'각주 원문'}];

test('restored server heads retain revisions and history while new readers stay in PDF mode',()=>{
  const heads={P0001:{revision:2,text:'원문[^1]'},'fn-001':{revision:7,text:'각주 원문'}};
  const effective=effectiveManuscriptEdits(paragraphs,notes,heads);
  assert.equal(Object.keys(effective).length,0);
  assert.equal(manuscriptModeAfterRefresh('pdf',false,Object.keys(effective).length),'pdf');
  assert.equal(heads.P0001.revision,2);assert.equal(heads['fn-001'].revision,7);
  assert.equal(citationContextWasEdited('fn-001',paragraphs,effective),false);
  const changed={...heads,P0001:{revision:3,text:'실제 수정'}};
  const changes=effectiveManuscriptEdits(paragraphs,notes,changed);
  assert.equal(Object.keys(changes).length,1);assert.equal(changes.P0001,changed.P0001);
  assert.equal(manuscriptModeAfterRefresh('pdf',false,Object.keys(changes).length),'body');
  assert.equal(manuscriptModeAfterRefresh('pdf',true,Object.keys(changes).length),'pdf');
});

test('deletions, whitespace changes and unknown originals remain effective edits',()=>{
  for(const text of ['',' ','원문[^1] ']){
    const heads={P0001:{text,revision:3}};
    assert.equal(effectiveManuscriptEdits(paragraphs,notes,heads).P0001,heads.P0001);
  }
  assert.equal(effectiveManuscriptEdits(paragraphs,notes,{'fn-001':{text:'',revision:8}})['fn-001'].text,'');
  assert.equal(effectiveManuscriptEdits(paragraphs,[],{'fn-001':{text:'미확인'}})['fn-001'].text,'미확인');
});

test('restored paragraphs have no changed marker, while current modifications render as amended',()=>{
  function render(text){return renderToStaticMarkup(React.createElement(WebManuscript,{paragraphs,notes,overrides:effectiveManuscriptEdits(paragraphs,notes,{P0001:{text,revision:2}}),page:12,zoom:1,selected:'',onPageChange(){},onParagraph(){},onNote(){}}));}
  assert.doesNotMatch(render('원문[^1]'),/class="manuscript-paragraph amended"/);
  assert.match(render('실제 수정'),/class="manuscript-paragraph amended"/);
});

test('workspace waits for original notes before choosing a view and keeps all raw heads in the editors',()=>{
  const source=readFileSync(new URL('../src/review-workspace.tsx',import.meta.url),'utf8');
  assert.match(source,/if\(data\)setManuscriptMode\(current=>manuscriptModeAfterRefresh\(current,manuscriptViewChosen.current,Object.keys\(effectiveShared\).length\)\)/);
  assert.doesNotMatch(source,/manuscriptModeAfterRefresh\([^;]*result.overrides.length/);
  assert.match(source,/overrides=\{effectiveShared\}/);
  assert.match(source,/current=\{shared\[paragraph.id\]\}/);assert.match(source,/current=\{shared\[active\]\}/);
});
