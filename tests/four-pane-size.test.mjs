import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_FOUR_PANE_CUTS,normalizeFourPaneCuts,moveFourPaneBoundary,fourPaneColumns,normalizeCollapsedSplit,collapsedPaneColumns,equalDocumentCuts,readPaneLayout,savePaneLayout,PANE_LAYOUT_STORAGE_KEY} from '../src/four-pane-size.ts';

test('missing and malformed saved dividers retain usable document widths',()=>{
  assert.deepEqual(normalizeFourPaneCuts(null),DEFAULT_FOUR_PANE_CUTS);
  assert.deepEqual(normalizeFourPaneCuts({thesis:NaN,sourceEnd:'wide'}),DEFAULT_FOUR_PANE_CUTS);
  for(const stored of [{thesis:100,sourceEnd:10},{thesis:-10,sourceEnd:900},{thesis:58,sourceEnd:20}]){
    const c=normalizeFourPaneCuts(stored);
    assert.ok(c.thesis>=22);
    assert.ok(c.sourceEnd-c.thesis>=20);
    assert.ok(100-c.sourceEnd>=20);
  }
});
test('each document divider moves independently without collapsing its neighbor',()=>{
  const c={thesis:40,sourceEnd:72};
  assert.deepEqual(moveFourPaneBoundary(c,'thesis',48),{thesis:48,sourceEnd:72});
  assert.deepEqual(moveFourPaneBoundary(c,'source',76),{thesis:40,sourceEnd:76});
  assert.deepEqual(moveFourPaneBoundary(c,'thesis',99),{thesis:52,sourceEnd:72});
  assert.deepEqual(moveFourPaneBoundary(c,'source',-99),{thesis:40,sourceEnd:60});
  assert.deepEqual(moveFourPaneBoundary(c,'source',Infinity),c);
  assert.deepEqual(c,{thesis:40,sourceEnd:72});
});
test('grid proportions exclude the two drag handles from document widths',()=>{
  assert.equal(fourPaneColumns({thesis:40,sourceEnd:72}),'minmax(0, 40fr) 6px minmax(0, 32fr) 6px minmax(0, 28fr)');
});
test('collapsed reading layout reclaims the editing width and keeps both documents usable',()=>{
  assert.equal(collapsedPaneColumns(undefined),'minmax(0, 50fr) 6px minmax(0, 50fr)');
  assert.equal(normalizeCollapsedSplit(-10),28);
  assert.equal(normalizeCollapsedSplit(99),72);
  assert.equal(normalizeCollapsedSplit(NaN),50);
  assert.equal(collapsedPaneColumns(65),'minmax(0, 65fr) 6px minmax(0, 35fr)');
});
test('both default layouts give thesis and reference equal widths',()=>{
  assert.equal(DEFAULT_FOUR_PANE_CUTS.thesis,DEFAULT_FOUR_PANE_CUTS.sourceEnd-DEFAULT_FOUR_PANE_CUTS.thesis);
  assert.equal(fourPaneColumns(DEFAULT_FOUR_PANE_CUTS),'minmax(0, 36fr) 6px minmax(0, 36fr) 6px minmax(0, 28fr)');
  assert.equal(collapsedPaneColumns(undefined),'minmax(0, 50fr) 6px minmax(0, 50fr)');
  const custom={thesis:28,sourceEnd:78};
  assert.deepEqual(equalDocumentCuts(custom),{thesis:39,sourceEnd:78},'equalizing must preserve the metadata width');
  assert.deepEqual(custom,{thesis:28,sourceEnd:78});
  const narrow=equalDocumentCuts({thesis:22,sourceEnd:42});
  assert.deepEqual(narrow,{thesis:22,sourceEnd:44});
  assert.equal(fourPaneColumns(narrow),'minmax(0, 22fr) 6px minmax(0, 22fr) 6px minmax(0, 56fr)');
});
test('legacy unequal sizes reset once while subsequent custom sizes survive reload',()=>{
  const entries=new Map([['paper-four-pane-cuts',JSON.stringify({thesis:40,sourceEnd:72})],['paper-collapsed-split','56']]);
  const storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};
  assert.deepEqual(readPaneLayout(storage),{cuts:{thesis:36,sourceEnd:72},collapsedSplit:50});
  savePaneLayout(storage,{thesis:39,sourceEnd:74},63);
  assert.deepEqual(readPaneLayout(storage),{cuts:{thesis:39,sourceEnd:74},collapsedSplit:63});
  assert.equal(entries.get('paper-collapsed-split'),'56','legacy preferences are not deleted');
  assert.equal(JSON.parse(entries.get(PANE_LAYOUT_STORAGE_KEY)).version,1);
});
test('invalid or unavailable layout storage leaves equal readable defaults',()=>{
  assert.deepEqual(readPaneLayout({getItem:()=>'{broken'}),readPaneLayout());
  assert.deepEqual(readPaneLayout({getItem:()=>JSON.stringify({version:99})}),readPaneLayout());
  assert.deepEqual(readPaneLayout({getItem:()=>{throw Error('disabled');}}),readPaneLayout());
  assert.doesNotThrow(()=>savePaneLayout({setItem:()=>{throw Error('quota');}},{thesis:36,sourceEnd:72},50));
});
test('reading-width adjustments leave the saved four-pane layout intact',()=>{
  const editingCuts={thesis:35,sourceEnd:68};
  const editingGrid=fourPaneColumns(editingCuts);
  collapsedPaneColumns(72);
  collapsedPaneColumns(28);
  assert.deepEqual(editingCuts,{thesis:35,sourceEnd:68});
  assert.equal(fourPaneColumns(editingCuts),editingGrid);
});
