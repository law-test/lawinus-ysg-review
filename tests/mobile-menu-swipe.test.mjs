import {test} from 'node:test';
import assert from 'node:assert/strict';
import {menuSwipeAction,mobileReadingView} from '../src/mobile-menu-swipe.ts';
import {DEFAULT_READING_VIEW,readingVisibility,withReadingSurface} from '../src/reading-view.ts';
const start={pointerId:1,x:50,y:50,time:10};
test('deliberate vertical movement selects collapse or restore',()=>{
 assert.equal(menuSwipeAction(start,{x:51,y:10,time:160}),'collapse');
 assert.equal(menuSwipeAction(start,{x:49,y:90,time:200}),'restore');
});
test('taps, horizontal movement, diagonal movement, and invalid timestamps are ignored',()=>{
 for(const end of [{x:50,y:45,time:100},{x:90,y:40,time:100},{x:90,y:10,time:100},{x:50,y:10,time:0}])assert.equal(menuSwipeAction(start,end),null);
});
test('a deliberately slow drag remains valid without requiring a fast swipe',()=>{
 assert.equal(menuSwipeAction(start,{x:51,y:14,time:9010}),'collapse');
 assert.equal(menuSwipeAction(start,{x:49,y:86,time:60010}),'restore');
});
test('short mobile screens start with hidden chrome while retaining navigation and normal preferences',()=>{
 const regular={...DEFAULT_READING_VIEW};const short=mobileReadingView(true,regular,null);
 assert.deepEqual(readingVisibility(short,true,true),{header:false,tools:false,footnotes:false,sidebar:true,metadata:true});
 assert.deepEqual(regular,DEFAULT_READING_VIEW);assert.equal(short.focus,false);
});
test('short screen tools can be restored explicitly and portrait returns to its original view',()=>{
 const regular={...DEFAULT_READING_VIEW,footnotes:false};const short=mobileReadingView(true,regular,null);
 const restored=withReadingSurface(short,'tools',true);
 assert.equal(mobileReadingView(true,regular,restored).tools,true);
 assert.deepEqual(mobileReadingView(false,regular,restored),regular);
});
