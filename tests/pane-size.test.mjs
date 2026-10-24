import assert from 'node:assert/strict';
import {test} from 'node:test';
import {clampPaneSize,draggedPaneSize,keyboardPaneSize} from '../src/pane-size.ts';

test('sidebar and document divider use their own units and preserve minimum reading width',()=>{
  assert.equal(draggedPaneSize(208,208,308,1,176,440),308);
  assert.ok(Math.abs(draggedPaneSize(53,650,750,100/1200,30,72)-(53+100/12))<1e-9);
  assert.equal(draggedPaneSize(208,208,-500,1,176,440),176);
  assert.equal(draggedPaneSize(53,650,2000,100/1200,30,72),72);
});
test('a drag starts at its current value without jumping to the edge of a handle',()=>{
  assert.equal(draggedPaneSize(53,731,731,100/1300,30,72),53);
  assert.equal(draggedPaneSize(320,323,323,1,176,440),320);
});
test('keyboard adjusts both handles and clamps values restored from storage',()=>{
  assert.equal(keyboardPaneSize('ArrowRight',430,176,440,16),440);
  assert.equal(keyboardPaneSize('ArrowLeft',31,30,72,2),30);
  assert.equal(keyboardPaneSize('Home',53,30,72,2),30);
  assert.equal(keyboardPaneSize('End',208,176,440,16),440);
  assert.equal(keyboardPaneSize('Tab',53,30,72,2),null);
  assert.equal(clampPaneSize(NaN,176,440),176);
  assert.equal(clampPaneSize(900,176,440),440);
});
