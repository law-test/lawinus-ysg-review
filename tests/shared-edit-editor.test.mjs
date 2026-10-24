import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const require=createRequire(import.meta.url);
const copySource=readFileSync(new URL('../src/revision-copy.tsx',import.meta.url),'utf8');
const copyModule={exports:{}};
vm.runInNewContext(ts.transpileModule(copySource,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{module:copyModule,exports:copyModule.exports,require:id=>id.endsWith('.css')?{}:require(id)});
const compositeModule={exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/revision-composite.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:compositeModule,exports:compositeModule.exports});
const {formatRevisionComparison:formatComparison,parseRevisionComparison:parseComparison}=compositeModule.exports;
const source=readFileSync(new URL('../src/shared-edit-editor.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
vm.runInNewContext(compiled,{module,exports:module.exports,require:id=>{
 if(id.endsWith('.css'))return {};
 if(id==='./shared-edits')return {};
 if(id==='./revision-copy')return copyModule.exports;
 if(id==='./revision-composite')return compositeModule.exports;
 return require(id);
}});
const {initialSharedEditorState:init,sharedEditorReducer:reduce,readSharedEditorDraft:readDraft,writeSharedEditorDraft:writeDraft,sharedDraftKey,SharedEditEditor}=module.exports;
function boxParts(html){const match=html.match(/<textarea[^>]+class="shared-edit-body shared-edit-comparison"[^>]*>([\s\S]*?)<\/textarea>/);assert.ok(match);const result=parseComparison(match[1]);assert.equal(result.ok,true);return result.parts;}
const edit=(revision,text)=>({id:String(revision),kind:'paragraph',targetId:'P0001',revision,text});
function memoryStorage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}

test('an intentionally emptied saved paragraph is not silently replaced by its original',()=>{
 const state=init('원문',edit(3,''));
 assert.equal(state.draft,'');assert.equal(state.baseText,'');assert.equal(state.revision,3);
});

test('a conflicting edit preserves the complete draft, reason and old expected revision',()=>{
 let state=init('원문',edit(1,'첫 수정'));
 state=reduce(state,{type:'draft',value:'내 초안\n두 번째 문단'});
 state=reduce(state,{type:'reason',value:'정확한 인용을 위한 수정'});
 state=reduce(state,{type:'conflict'});
 assert.equal(state.draft,'내 초안\n두 번째 문단');assert.equal(state.reason,'정확한 인용을 위한 수정');
 assert.equal(state.revision,1);assert.equal(state.conflict,true);
});

test('reviewing a newer version preserves the draft and requires confirmation before overwriting it',()=>{
 let state=reduce(init('원문',edit(1,'첫 수정')),{type:'draft',value:'내 문안'});
 state=reduce(state,{type:'incoming',revision:2,text:'다른 방문자의 문안'});
 assert.equal(state.revision,1);assert.equal(state.draft,'내 문안');assert.equal(state.conflict,true);
 state=reduce(state,{type:'latest',revision:2,text:'다른 방문자의 문안'});
 assert.equal(state.revision,2);assert.equal(state.baseText,'다른 방문자의 문안');
 assert.equal(state.draft,'내 문안');assert.equal(state.conflict,false);assert.equal(state.confirmOverwrite,true);
 state=reduce(state,{type:'saved',edit:edit(3,'내 문안')});
 assert.equal(state.revision,3);assert.equal(state.baseText,state.draft);assert.equal(state.confirmOverwrite,false);
});

test('clean drafts follow external updates while late responses cannot roll back an accepted revision',()=>{
 let state=init('원문');
 state=reduce(state,{type:'incoming',revision:4,text:'새 본문'});
 assert.equal(state.draft,'새 본문');assert.equal(state.revision,4);assert.equal(state.conflict,false);
 assert.equal(reduce(state,{type:'latest',revision:2,text:'오래된 본문'}),state);
 assert.equal(reduce(state,{type:'incoming',revision:3,text:'오래된 본문'}),state);
});

test('restoration accepts the server-created new revision rather than resetting to the old number',()=>{
 let state=init('원문',edit(7,'현재'));
 state=reduce(state,{type:'saved',edit:{...edit(8,'원문'),action:'restore',restoredFromRevision:0}});
 assert.equal(state.revision,8);assert.equal(state.draft,'원문');assert.equal(state.baseText,'원문');
 assert.equal(state.reason,'');assert.equal(state.conflict,false);
});

test('the initial accessible editor preserves deleted text and offers an empty safe deletion proposal',()=>{
 const html=renderToStaticMarkup(React.createElement(SharedEditEditor,{
  kind:'paragraph',targetId:'P0001',originalText:'되살아나면 안 되는 원문',proposalApplyText:'',current:edit(3,''),onSaved:()=>{},
 }));
 assert.match(html,/수정할 문안/);assert.match(html,/Before 넣기/);assert.match(html,/삭제안 넣기/);
 assert.match(html,/본문 수정하기/);assert.match(html,/변경 이력 보기/);
 assert.match(html,/되살아나면 안 되는 원문/);
 assert.equal(boxParts(html).after,'');
});

test('unsupported layout or compound changes cannot inject displayed After instructions',()=>{
 const html=renderToStaticMarkup(React.createElement(SharedEditEditor,{
  kind:'paragraph',targetId:'P0001',originalText:'원래 본문',proposalUnsupportedReason:'여러 문단과 각주를 함께 편집해야 합니다.',current:undefined,onSaved:()=>{},
 }));
 assert.match(html,/여러 문단과 각주를 함께 편집해야 합니다/);
 assert.doesNotMatch(html,/After 넣기|삭제안 넣기/);
 assert.equal(boxParts(html).after,'원래 본문');
 const safe=renderToStaticMarkup(React.createElement(SharedEditEditor,{
  kind:'footnote',targetId:'fn-001',originalText:'원래 각주',proposalApplyText:'수정된 각주',current:undefined,onSaved:()=>{},
 }));
 assert.match(safe,/After 넣기/);
 assert.equal(boxParts(safe).after,'수정된 각주');
});

test('switching paragraphs and footnotes preserves separate drafts and their conflict baselines',()=>{
 const store=memoryStorage();
 let paragraph=reduce(init('본문 원문',edit(4,'저장된 본문')),{type:'draft',value:'본문 초안'});
 paragraph=reduce(paragraph,{type:'reason',value:'본문 수정 이유'});
 const footnote=reduce(init('각주 원문'),{type:'draft',value:'각주 초안'});
 writeDraft(store,'paragraph','P0001','본문 원문',paragraph);writeDraft(store,'footnote','fn-001','각주 원문',footnote);
 const restored=readDraft(store,'paragraph','P0001','본문 원문',edit(5,'다른 방문자 수정'));
 assert.equal(restored.recovered,true);assert.equal(restored.state.draft,'본문 초안');assert.equal(restored.state.reason,'본문 수정 이유');
 assert.equal(restored.state.revision,4);assert.equal(restored.state.baseText,'저장된 본문');
 const conflicted=reduce(restored.state,{type:'incoming',revision:5,text:'다른 방문자 수정'});
 assert.equal(conflicted.conflict,true);assert.equal(conflicted.draft,'본문 초안');
 assert.equal(readDraft(store,'footnote','fn-001','각주 원문').state.draft,'각주 초안');
});

test('saving or restoring clears only that target draft, while a changed original is not given an old draft',()=>{
 const store=memoryStorage();let a=reduce(init('원문'),{type:'draft',value:'초안'});
 writeDraft(store,'paragraph','P0001','원문',a);writeDraft(store,'paragraph','P0002','별도 원문',a);
 const changed=readDraft(store,'paragraph','P0001','새 기준본');assert.equal(changed.recovered,false);assert.equal(changed.state.draft,'새 기준본');
 a=reduce(a,{type:'saved',edit:edit(1,'초안')});writeDraft(store,'paragraph','P0001','원문',a);
 assert.equal(store.getItem(sharedDraftKey('paragraph','P0001')),null);
 assert.notEqual(store.getItem(sharedDraftKey('paragraph','P0002')),null);
});

test('storage failures and malformed drafts leave the authoritative initial text available',()=>{
 const bad={getItem(){throw new Error('blocked');}};
 assert.equal(readDraft(bad,'paragraph','P0001','원문').failed,true);
 const store=memoryStorage();store.setItem(sharedDraftKey('paragraph','P0001'),'{bad json');
 const result=readDraft(store,'paragraph','P0001','원문');assert.equal(result.state.draft,'원문');assert.equal(result.recovered,false);
});

test('After copy preserves display instructions while unsupported proposals remain non-applicable',()=>{
 const html=renderToStaticMarkup(React.createElement(SharedEditEditor,{
  kind:'footnote',targetId:'fn-001',originalText:'원래 각주',proposalDisplayText:'새 각주를 추가하고 본문을 함께 고친다.',proposalReason:'새 각주가 필요하다.',proposalUnsupportedReason:'본문과 새 각주를 함께 편집해야 합니다.',current:undefined,onSaved:()=>{},
 }));
 assert.match(html,/Before 복사/);assert.match(html,/After 복사/);
 assert.match(html,/새 각주를 추가하고 본문을 함께 고친다/);assert.match(html,/새 각주가 필요하다/);
 assert.doesNotMatch(html,/After 넣기|삭제안 넣기/);
 assert.equal(boxParts(html).after,'새 각주를 추가하고 본문을 함께 고친다.');
 assert.match(html,/원문으로 직접 편집 시작/);
});

test('a safe After offers copy and load without replacing an existing saved edit on opening',()=>{
 const html=renderToStaticMarkup(React.createElement(SharedEditEditor,{
  kind:'paragraph',targetId:'P0001',originalText:'원문',proposalDisplayText:'최신 수정제안 〔각주 9〕',proposalApplyText:'최신 수정제안 [^7]',current:edit(4,'방문자가 저장한 문안'),onSaved:()=>{},
 }));
 assert.match(html,/After 복사/);assert.match(html,/After 넣기/);
 assert.equal(boxParts(html).after,'방문자가 저장한 문안');
 assert.doesNotMatch(html,/>최신 수정제안 \[\^7\]<\/textarea>/);
});

test('copying uses the exact requested display text and propagates failure instead of reporting success',async()=>{
 const writes=[];const clipboard={writeText:async text=>{writes.push(text);}};
 const after='(삭제)\n〔각주 9〕';
 await copyModule.exports.copyRevisionText(after,clipboard);
 assert.deepEqual(writes,[after]);
 await assert.rejects(copyModule.exports.copyRevisionText(after,undefined));
 await assert.rejects(copyModule.exports.copyRevisionText(after,{writeText:async()=>{throw new Error('blocked');}}));
 assert.deepEqual(writes,[after]);
});


test('one editable textarea contains Before After and reason while manual instructions remain locked',()=>{
 const html=renderToStaticMarkup(React.createElement(SharedEditEditor,{
  kind:'paragraph',targetId:'P0001',originalText:'저장 대상 원문 행',proposalBeforeText:'표 전체 원문\n저장 대상 원문 행',proposalDisplayText:'표를 부록으로 이동한다.',proposalReason:'본문의 논증과 조문안을 구별한다.',proposalUnsupportedReason:'조판 위치를 수동으로 옮깁니다.',current:undefined,onSaved:()=>{},
 }));
 const parts=boxParts(html);
 assert.equal(parts.before,'표 전체 원문\n저장 대상 원문 행');assert.equal(parts.after,'표를 부록으로 이동한다.');assert.equal(parts.reason,'본문의 논증과 조문안을 구별한다.');
 assert.equal((html.match(/class="shared-edit-body shared-edit-comparison"/g)||[]).length,1);
 assert.doesNotMatch(html,/After 넣기|삭제안 넣기/);
 assert.match(html,/<button[^>]*disabled=""[^>]*>본문 수정하기<\/button>/);
});

test('strict comparison parsing preserves multiline After and rejects missing duplicated or reordered headers',()=>{
 const parts={before:'원문 Before\n---\n다음 행',after:'수정안\n\n[^7]',reason:'근거를 보완한다.'};
 const text=formatComparison(parts);const parsed=parseComparison(text);assert.equal(parsed.ok,true);assert.equal(JSON.stringify(parsed.parts),JSON.stringify(parts));
 for(const bad of [text.replace('【After】','After'),text+'\n【After】\n추가',text.replace('---\n【After】','【After】'),text.replace('【Before】','【상세이유】'),text.replace('【After】','【상세이유】')])assert.equal(parseComparison(bad).ok,false);
 assert.equal(parseComparison(formatComparison({...parts,after:''})).parts.after,'');
 assert.equal(parseComparison(text.replaceAll('\n','\r\n')).parts.after,parts.after);
});

test('comparison editing updates only parsed After while invalid envelopes preserve draft and block their parse',()=>{
 let state={...init('원문'),comparison:formatComparison({before:'원문',after:'원문',reason:'이유'})};
 state=reduce(state,{type:'comparison',value:formatComparison({before:'Before를 고침',after:'원문',reason:'이유를 고침'})});
 assert.equal(state.draft,state.baseText);
 state=reduce(state,{type:'comparison',value:formatComparison({before:'Before를 고침',after:'새 문안',reason:'이유를 고침'})});
 assert.equal(state.draft,'새 문안');
 const broken=state.comparison.replace('【After】','깨진 표지');state=reduce(state,{type:'comparison',value:broken});
 assert.equal(state.draft,'새 문안');assert.equal(parseComparison(state.comparison).ok,false);
 const store=memoryStorage();writeDraft(store,'paragraph','P0001','원문',state);assert.equal(readDraft(store,'paragraph','P0001','원문').state.comparison,broken);
 state=reduce(state,{type:'incoming',revision:1,text:'다른 사람 문안'});assert.equal(state.comparison,broken);assert.equal(state.conflict,true);
});

test('saved and restored raw server text replace only After and keep comparison headings out of the payload',()=>{
 let state={...init('원문'),comparison:formatComparison({before:'원문',after:'초안',reason:'상세이유'}),draft:'초안',comparisonEdited:true};
 state=reduce(state,{type:'saved',edit:edit(2,'저장된 문안')});assert.equal(state.draft,'저장된 문안');assert.equal(parseComparison(state.comparison).parts.after,'저장된 문안');assert.equal(state.comparisonEdited,false);
 state=reduce(state,{type:'incoming',revision:3,text:'외부 수정'});assert.equal(parseComparison(state.comparison).parts.after,'외부 수정');
 assert.match(source,/text:parsedComparison\.parts\.after,expectedRevision/);assert.match(source,/\|\|saveBlocked\|\|!parsedComparison\.ok/);
});


test('explicit restoration repairs a malformed comparison around the returned server text',()=>{
 const broken={...init('원문'),comparison:'깨진 표지와 이전 초안',draft:'이전 초안',comparisonEdited:true};
 const repaired=formatComparison({before:'원문',after:'복원된 서버 문안',reason:'지시서 이유'});
 const state=reduce(broken,{type:'saved',edit:edit(3,'복원된 서버 문안'),comparison:repaired});
 assert.equal(parseComparison(state.comparison).parts.after,state.draft);assert.equal(state.draft,'복원된 서버 문안');assert.equal(state.comparisonEdited,false);
});


test('automatic proposal display is not stored as a user draft until the user edits or inserts text',()=>{
 const store=memoryStorage();let state={...init('원문'),draft:'최신 After',autoProposal:true,comparison:formatComparison({before:'원문',after:'최신 After',reason:'지시서 이유'})};
 writeDraft(store,'paragraph','P0001','원문',state);assert.equal(store.getItem(sharedDraftKey('paragraph','P0001')),null);
 state=reduce(state,{type:'comparison',value:formatComparison({before:'원문',after:'내가 편집한 After',reason:'지시서 이유'})});
 writeDraft(store,'paragraph','P0001','원문',state);assert.equal(readDraft(store,'paragraph','P0001','원문').state.draft,'내가 편집한 After');assert.equal(state.autoProposal,false);
});


test('viewing a prefilled After alone needs no overwrite prompt while actual input remains protected',()=>{
 const {hasSharedUserDraft}=module.exports;
 const automatic={...init('원문'),draft:'지시서 After',autoProposal:true};assert.equal(hasSharedUserDraft(automatic),false);
 assert.equal(hasSharedUserDraft({...automatic,reason:'내 입력 이유'}),true);
 assert.equal(hasSharedUserDraft({...automatic,comparisonEdited:true}),true);
 assert.equal(hasSharedUserDraft({...automatic,autoProposal:false}),true);
 assert.match(source,/else if\(hasSharedUserDraft\(state\)&&!window\.confirm/);
});

test('resetting an unsaved comparison restores the safe latest After and removes only that target draft',()=>{
 const {resetSharedEditorDraft:reset,hasSharedUserDraft}=module.exports;
 const store=memoryStorage();
 const dirty={...init('원문'),draft:'내 문안',comparison:'깨진 표지',comparisonEdited:true,reason:'내 이유'};
 writeDraft(store,'paragraph','P0001','원문',dirty);writeDraft(store,'footnote','fn-001','별도 각주',dirty);
 const clean=reset(dirty,{originalText:'원문',proposalBeforeText:'전체 원문',proposalApplyText:'안전한 After [^7]',proposalDisplayText:'표시용 After 〔각주 8〕',proposalReason:'상세이유'});
 assert.equal(clean.draft,'안전한 After [^7]');assert.equal(clean.autoProposal,true);assert.equal(hasSharedUserDraft(clean),false);
 assert.equal(parseComparison(clean.comparison).parts.before,'전체 원문');assert.equal(parseComparison(clean.comparison).parts.after,clean.draft);
 writeDraft(store,'paragraph','P0001','원문',clean);assert.equal(store.getItem(sharedDraftKey('paragraph','P0001')),null);
 assert.notEqual(store.getItem(sharedDraftKey('footnote','fn-001')),null);
 const restored=reduce(clean,{type:'resetDraft',state:dirty});assert.equal(restored.comparison,'깨진 표지');assert.equal(restored.reason,'내 이유');
 assert.doesNotMatch(source.slice(source.indexOf('function resetInput()'),source.indexOf('function acceptSaved(')),/saveSharedEdit|restoreSharedEdit|window\.confirm/);
});

test('resetting preserves the newest saved text including deliberate deletion rather than overwriting it with a proposal',()=>{
 const {resetSharedEditorDraft:reset}=module.exports;
 const state={...init('원문',edit(4,'기존 저장 문안')),draft:'내 초안',comparisonEdited:true,conflict:true};
 const clean=reset(state,{originalText:'원문',proposalApplyText:'최신 제안',current:edit(5,'')});
 assert.equal(clean.revision,5);assert.equal(clean.baseText,'');assert.equal(clean.draft,'');assert.equal(clean.autoProposal,false);assert.equal(clean.conflict,false);
 const afterHistory=reset({...state,revision:6,baseText:'최신 이력에서 본 문안'},{originalText:'원문',proposalApplyText:'최신 제안',current:edit(5,'이전 공통 문안')});
 assert.equal(afterHistory.revision,6);assert.equal(afterHistory.draft,'최신 이력에서 본 문안');
 assert.equal(module.exports.undoSharedEditorReset(state,afterHistory).conflict,true);
});

test('resetting a manual compound proposal restores its locked state and does not turn layout instructions into editable body text',()=>{
 const {resetSharedEditorDraft:reset}=module.exports;
 const clean=reset({...init('원문'),draft:'수동 편집 초안',comparisonEdited:true},{originalText:'원문',proposalDisplayText:'부록으로 이동하고 새 각주를 추가한다.',proposalReason:'전체 조판 필요'});
 assert.equal(clean.manualLocked,true);assert.equal(clean.draft,'원문');assert.equal(clean.baseText,'원문');
 assert.equal(parseComparison(clean.comparison).parts.after,'부록으로 이동하고 새 각주를 추가한다.');
});

test('undoing a reset retains a conflict detected while an automatically displayed proposal was open',()=>{
 const {resetSharedEditorDraft:reset,undoSharedEditorReset:undo}=module.exports;
 const previous={...init('원문'),draft:'내 기존 초안',comparisonEdited:true};
 const clean=reset(previous,{originalText:'원문',proposalApplyText:'최신 안전한 After'});
 const notified=reduce(clean,{type:'incoming',revision:1,text:'다른 방문자 문안'});
 assert.equal(notified.revision,0);assert.equal(notified.conflict,true);
 const restored=undo(previous,notified,1);
 assert.equal(restored.draft,'내 기존 초안');assert.equal(restored.revision,0);assert.equal(restored.conflict,true);
 assert.equal(undo(previous,clean,1).conflict,true);
 assert.equal(undo(previous,clean,0).conflict,false);
});

test('resetting uses the newest already-read history and keeps a conflict when its newest body is unavailable',()=>{
 const {resetSharedEditorDraft:reset}=module.exports;
 const state={...init('원문',edit(4,'네 번째 문안')),draft:'내 초안',comparisonEdited:true,conflict:true};
 const latest=reset(state,{originalText:'원문',current:edit(4,'네 번째 문안'),history:{currentRevision:5,revisions:[edit(5,'이력에서 읽은 최신 문안')]}});
 assert.equal(latest.revision,5);assert.equal(latest.draft,'이력에서 읽은 최신 문안');assert.equal(latest.conflict,false);
 const missing=reset(state,{originalText:'원문',current:edit(4,'네 번째 문안'),history:{currentRevision:5,revisions:[]}});
 assert.equal(missing.revision,4);assert.equal(missing.conflict,true);
 assert.equal(reset(state,{originalText:'원문',current:edit(4,'네 번째 문안')}).conflict,true);
});
