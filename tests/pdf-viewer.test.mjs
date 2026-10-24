import assert from 'node:assert/strict';
import {test} from 'node:test';
import {footnoteTargets,targetAt,normalizedPoint,pageLayout,pageIndexAt,visiblePageRange,reflowScrollPosition,pendingPdfReflow,movedPointer,watchDocumentInterruption,measurableViewport,pdfCanvasSize,pdfLoadError} from '../src/pdf-viewer-model.ts';

// Actual fn-001 coordinates from the unchanged human-1021-1559 manifest.
const first={id:'fn-001',number:1,clickTargets:[{page:20,rect:[117.16,390.416,124.53,398.69],kind:'body-marker'},{page:20,rect:[56.543,546.952,62.47,553.667],kind:'footnote-marker'}],noteHighlights:[{page:20,rect:[62.533,547.048,464.014,556.041],kind:'footnote-text'},{page:20,rect:[69.601,563.716,170.157,572.709],kind:'footnote-text'}]};
test('full two-line footnote and original body superscript are independently clickable',()=>{
  const targets=footnoteTargets([first]);assert.equal(targets.length,4);
  assert.equal(targetAt(targets,300,551)?.noteId,'fn-001');assert.equal(targetAt(targets,140,568)?.noteId,'fn-001');
  assert.equal(targetAt(targets,120,395)?.kind,'body-marker');
  assert.equal(targetAt(targets,300,568),undefined,'short final line must not expand into blank space');
  assert.equal(targetAt(targets,140,560),undefined,'line gap must not become a union rectangle');
});
test('continuations retain their own page and do not overlap a later footnote',()=>{
  // Synthetic boundary fixture verifies the viewer, not a claim of a source continuation.
  const notes=[first,{id:'fn-002',number:2,noteHighlights:[{page:20,rect:[60,580,300,589]},{page:21,rect:[60,50,400,59]}]}];
  const all=footnoteTargets(notes),p20=all.filter(x=>x.page===20),p21=all.filter(x=>x.page===21);
  assert.equal(targetAt(p20,140,568)?.noteId,'fn-001');assert.equal(targetAt(p20,140,585)?.noteId,'fn-002');
  assert.equal(targetAt(p21,140,55)?.noteId,'fn-002');assert.equal(targetAt(p20,140,55),undefined);
});
test('invalid geometry is ignored and duplicate evidence rectangles are not duplicated',()=>{
  const x={id:'fn-009',number:9,clickTargets:[{page:1,rect:[1,1,9,9]}],noteHighlights:[{page:1,rect:[1,1,9,9]},{page:1,rect:[9,1,1,9]},{page:0,rect:[1,1,2,2]},{page:2,rect:[NaN,1,3,3]}]};
  assert.equal(footnoteTargets([x]).length,1);
});
test('pointer coordinates remain exact at zoom and inside a scrolled page',()=>{
  assert.deepEqual(normalizedPoint(300,450,{left:100,top:50,width:400,height:800}),{x:.5,y:.5});
  assert.deepEqual(normalizedPoint(900,0,{left:100,top:50,width:400,height:800}),{x:1,y:0});
  assert.equal(movedPointer({x:10,y:20},12,22),false);assert.equal(movedPointer({x:10,y:20},10,30),true);
});
test('279-page document renders only viewport neighbors, including at the end',()=>{
  const layout=pageLayout(279,515,1,{});const p20=layout.offsets[19];
  const visible=visiblePageRange(layout.offsets,p20,900,1);assert.deepEqual(visible,[19,20,21,22]);assert.ok(visible.length<10);
  assert.equal(pageIndexAt(layout.offsets,p20),19);assert.equal(pageIndexAt(layout.offsets,1e9),278);assert.equal(pageIndexAt(layout.offsets,-10),0);
  assert.deepEqual(visiblePageRange(layout.offsets,layout.offsets[278],900,1),[278,279]);
});
test('zoom/column resize keeps the same page and relative reading position',()=>{
  const before=pageLayout(279,515,1,{}),after=pageLayout(279,600,1.5,{});
  const oldPosition=before.offsets[49]+before.heights[49]*.4,newPosition=reflowScrollPosition(before,after,oldPosition);
  assert.equal(pageIndexAt(after.offsets,newPosition),49);
  assert.ok(Math.abs((newPosition-after.offsets[49])/after.heights[49]-.4)<1e-9);
});
test('late-page panel resize restores the saved position after the DOM clamps its scroll range',()=>{
  for(const [count,page] of [[279,249],[220,200]]){
    const wide=pageLayout(count,800,1,{}),narrow=pageLayout(count,570,1,{}),fraction=.1;
    const saved=wide.offsets[page-1]+wide.heights[page-1]*fraction;
    const clampedDOM=Math.min(saved,narrow.totalHeight-650);
    assert.ok(clampedDOM<saved,'fixture must exercise browser scroll-range clamping');
    assert.notEqual(pageIndexAt(narrow.offsets,reflowScrollPosition(wide,narrow,clampedDOM)),page-1,'reading the post-resize DOM reproduces the old jump');
    const restored=reflowScrollPosition(wide,narrow,saved);
    assert.equal(pageIndexAt(narrow.offsets,restored),page-1);
    assert.ok(Math.abs((restored-narrow.offsets[page-1])/narrow.heights[page-1]-fraction)<1e-9);
    const expanded=reflowScrollPosition(narrow,wide,restored);
    assert.ok(Math.abs(expanded-saved)<1e-8,'closing the detail panel returns to the same page fraction');
    const zoomed=pageLayout(count,800,1.15,{}),zoomPosition=reflowScrollPosition(wide,zoomed,expanded);
    assert.equal(pageIndexAt(zoomed.offsets,zoomPosition),page-1);
    assert.ok(Math.abs(reflowScrollPosition(zoomed,wide,zoomPosition)-saved)<1e-8);
  }
});
test('transitional resize and stale frames cannot report a clamped page before layout restoration',()=>{
  const old=pageLayout(279,800,1,{}),next=pageLayout(279,570,1,{});
  assert.equal(pendingPdfReflow(old,old,800,570),true,'CSS width changed before ResizeObserver rendered new pages');
  assert.equal(pendingPdfReflow(old,next,570,570),true,'new DOM rendered but saved position not committed yet');
  assert.equal(pendingPdfReflow(next,next,570,570),false,'restoration has committed and genuine scrolling can report again');
  assert.equal(pendingPdfReflow(undefined,next,570,570),true,'first layout must establish a position before reporting');
});
test('mixed page sizes use their measured height without merging left/right document navigation',()=>{
  const thesis=pageLayout(279,515,1,{}),source=pageLayout(3,600,1,{2:{width:800,height:400}},{width:600,height:900});
  assert.equal(source.heights[0],900);assert.equal(source.heights[1],300);assert.equal(source.offsets[2],1248);
  assert.equal(pageIndexAt(source.offsets,1248),2);assert.equal(pageIndexAt(thesis.offsets,1248),1);
});
test('equal reading widths at 100 percent show equal paper widths regardless of page format',()=>{
  const thesisViewport=measurableViewport(700,650,44),sourceViewport=measurableViewport(700,420,44);
  const thesis=pageLayout(279,thesisViewport.width,1,{1:{width:515,height:728}});
  const source=pageLayout(48,sourceViewport.width,1,{1:{width:612,height:792}});
  assert.equal(thesis.width,656);assert.equal(source.width,thesis.width);
  assert.notEqual(thesis.heights[0],source.heights[0],'page aspect ratios must remain intact');
  assert.equal(pageLayout(48,sourceViewport.width,1.3,{}).width,656*1.3,'source zoom remains independent');
});
test('hand drag is cancelled on focus loss/page hide, with no retained listeners after unmount',()=>{
  const win=new EventTarget(),doc=Object.assign(new EventTarget(),{hidden:false});let cancelled=0;
  const dispose=watchDocumentInterruption(()=>cancelled++,win,doc);
  win.dispatchEvent(new Event('blur'));assert.equal(cancelled,1);
  doc.dispatchEvent(new Event('visibilitychange'));assert.equal(cancelled,1,'returning to the page must not start or cancel a fresh gesture');
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(cancelled,2);
  win.dispatchEvent(new Event('pagehide'));assert.equal(cancelled,3);
  dispose();win.dispatchEvent(new Event('blur'));doc.dispatchEvent(new Event('visibilitychange'));assert.equal(cancelled,3);
});
test('a hidden mobile pane cannot replace its last readable dimensions with zero',()=>{
  assert.equal(measurableViewport(0,0,24),null);assert.equal(measurableViewport(390,0,24),null);assert.equal(measurableViewport(0,700,24),null);
  assert.deepEqual(measurableViewport(390,700,24),{width:366,height:700});
  const shown=measurableViewport(390,700,24),before=pageLayout(279,shown.width,1,{}),top=before.offsets[119]+before.heights[119]*.65;
  const hiddenSize=measurableViewport(0,0,24);
  const retained=hiddenSize?pageLayout(279,hiddenSize.width,1,{}):before;
  assert.equal(retained,before,'hidden tab must retain its layout rather than shrink every page');
  const reopened=measurableViewport(844,390,24),after=pageLayout(279,reopened.width,1,{}),restored=reflowScrollPosition(retained,after,top);
  assert.equal(pageIndexAt(after.offsets,restored),119);assert.ok(Math.abs((restored-after.offsets[119])/after.heights[119]-.65)<1e-9);
});

test('mobile landscape zoom caps raster memory without changing document coordinates',()=>{
  for(const [width,height,dpr] of [[366,518,3],[1640,2320,3],[3000,10000,2]]){
    const raster=pdfCanvasSize(width,height,dpr,true);
    assert.ok(raster.width*raster.height<=2_000_000);
    assert.ok(raster.width<=4096&&raster.height<=4096);
    assert.ok(raster.scale<=2&&raster.scale>0);
    assert.ok(Math.abs(raster.width-width*raster.scale)<1);
    assert.ok(Math.abs(raster.height-height*raster.scale)<1);
  }
  assert.deepEqual(pdfCanvasSize(366,518,2,true),{width:732,height:1036,scale:2},'normal phone fit remains sharp');
  assert.ok(pdfCanvasSize(1640,2320,2,false).width*pdfCanvasSize(1640,2320,2,false).height<=4_000_000);
  assert.deepEqual(pdfCanvasSize(NaN,0,Infinity),{width:1,height:1,scale:1});
});

test('PDF load failures offer a useful retry or native-view path without raw error contents',()=>{
  assert.match(pdfLoadError({name:'PasswordException'}),/암호/);
  assert.match(pdfLoadError({name:'MissingPDFException'}),/연결.*다시/);
  assert.match(pdfLoadError({message:'Promise.withResolvers is not a function'}),/브라우저.*원문/);
  assert.match(pdfLoadError(new Error('failed fetching confidential/path')),/다시 불러/);
  assert.ok(!pdfLoadError(new Error('failed fetching confidential/path')).includes('confidential'));
});
