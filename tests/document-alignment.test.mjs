import assert from 'node:assert/strict';
import {test} from 'node:test';
import {calculateDocumentAlignment,connectDocumentAlignment} from '../src/document-alignment.ts';

const bounds=(top,bottom,applied)=>({top,bottom,width:650,visible:true,applied});
test('unequal toolbars and footers produce one shared PDF viewport without changing page geometry',()=>{
 const result=calculateDocumentAlignment(bounds(250,910),bounds(290,950));
 assert.deepEqual(result,{thesis:{top:40,bottom:0},source:{top:0,bottom:40},aligned:true});
 assert.equal(250+result.thesis.top,290+result.source.top);
 assert.equal(910-result.thesis.bottom,950-result.source.bottom);
});
test('repeated resize measurements subtract the previous adjustment instead of accumulating blank space',()=>{
 const first=calculateDocumentAlignment(bounds(250,910),bounds(290,950));
 const again=calculateDocumentAlignment(bounds(290,910,first.thesis),bounds(290,910,first.source));
 assert.deepEqual(again,first);
 // Simulated 200% text wrapping adds height to the thesis toolbar and footer.
 const rewrapped=calculateDocumentAlignment(bounds(360,880,first.thesis),bounds(290,910,first.source));
 assert.deepEqual(rewrapped,{thesis:{top:0,bottom:0},source:{top:30,bottom:70},aligned:true});
});
test('hidden documents and insufficient shared reading height release all alignment space',()=>{
 for(const right of [{...bounds(290,950),visible:false},{...bounds(290,950),width:0},bounds(880,950)]){
  assert.deepEqual(calculateDocumentAlignment(bounds(250,910),right),{thesis:{top:0,bottom:0},source:{top:0,bottom:0},aligned:false});
 }
});

test('the controller survives source replacement, font reflow and mobile hiding without writing scroll positions',()=>{
 const previousResize=globalThis.ResizeObserver,previousMutation=globalThis.MutationObserver;
 const resizers=[],mutations=[],frames=new Map();let nextFrame=0;
 class Observer{constructor(callback,store){this.callback=callback;this.items=new Set();this.closed=false;store.push(this);}observe(node){this.items.add(node);}unobserve(node){this.items.delete(node);}disconnect(){this.items.clear();this.closed=true;}}
 globalThis.ResizeObserver=class extends Observer{constructor(cb){super(cb,resizers);}};
 globalThis.MutationObserver=class extends Observer{constructor(cb){super(cb,mutations);}};
 const win=Object.assign(new EventTarget(),{innerWidth:1920,requestAnimationFrame(fn){const id=++nextFrame;frames.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);}});
 const document={defaultView:win,documentElement:{}};
 const flush=()=>{let passes=0;while(frames.size){assert.ok(++passes<10,'alignment must settle');const work=[...frames.values()];frames.clear();for(const fn of work)fn();}};
 const element=(top,bottom)=>{
  const vars=new Map();return {ownerDocument:document,parentElement:null,children:[],shown:true,top,bottom,scrollTop:14903,scrollLeft:23,
   style:{setProperty:(key,value)=>vars.set(key,value),removeProperty:key=>vars.delete(key)},vars,
   get clientHeight(){return this.shown?this.bottom-this.top-(parseFloat(vars.get('--document-align-top'))||0)-(parseFloat(vars.get('--document-align-bottom'))||0):0;},
   getClientRects(){return this.shown?[{}]:[];},
   getBoundingClientRect(){return {top:this.top+(parseFloat(vars.get('--document-align-top'))||0),bottom:this.bottom-(parseFloat(vars.get('--document-align-bottom'))||0),width:this.shown?650:0};}
  };
 };
 const left=element(250,910),right=element(290,950),replacement=element(330,930);
 let source=right;
 const container={ownerDocument:document,querySelector:selector=>selector.startsWith('.thesis')?left:source};
 left.parentElement=container;right.parentElement=container;replacement.parentElement=container;container.children=[left,right];
 let cleanup;
 try{
  cleanup=connectDocumentAlignment(container);
  assert.equal(left.vars.get('--document-align-top'),'40px');assert.equal(right.vars.get('--document-align-bottom'),'40px');
  resizers[0].callback();flush();assert.equal(left.vars.get('--document-align-top'),'40px');
  left.top=320;left.bottom=880;mutations[1].callback();flush();
  assert.equal(left.vars.size,0);assert.equal(right.vars.get('--document-align-top'),'30px');assert.equal(right.vars.get('--document-align-bottom'),'70px');
  source=replacement;container.children=[left,replacement];mutations[0].callback();flush();
  assert.equal(right.vars.size,0,'detached source must release its margin');assert.equal(left.vars.get('--document-align-top'),'10px');
  source.shown=false;resizers[0].callback();flush();assert.equal(left.vars.size,0);assert.equal(replacement.vars.size,0);
  source.shown=true;resizers[0].callback();flush();assert.equal(left.vars.get('--document-align-top'),'10px');
  source=null;mutations[0].callback();flush();assert.equal(left.vars.size,0);assert.equal(replacement.vars.size,0);
  source=replacement;mutations[0].callback();flush();assert.equal(left.vars.get('--document-align-top'),'10px');
  win.innerWidth=900;win.dispatchEvent(new Event('resize'));flush();assert.equal(left.vars.size,0);assert.equal(replacement.vars.size,0);
  win.innerWidth=1920;win.dispatchEvent(new Event('resize'));flush();
  // Focus mode hides every outer header/footer while retaining both scrollports.
  left.top=0;left.bottom=1000;replacement.top=0;replacement.bottom=1000;
  resizers[0].callback();flush();assert.equal(left.vars.size,0);assert.equal(replacement.vars.size,0);
  left.top=320;left.bottom=880;replacement.top=330;replacement.bottom=930;
  resizers[0].callback();flush();assert.equal(left.vars.get('--document-align-top'),'10px');assert.equal(replacement.vars.get('--document-align-bottom'),'50px');
  for(const item of [left,right,replacement])assert.deepEqual([item.scrollTop,item.scrollLeft],[14903,23]);
  cleanup();cleanup=undefined;
  assert.equal(left.vars.size,0);assert.equal(replacement.vars.size,0);assert.equal(frames.size,0);
  assert.ok([...resizers,...mutations].every(observer=>observer.closed));
 }finally{cleanup?.();globalThis.ResizeObserver=previousResize;globalThis.MutationObserver=previousMutation;}
});
