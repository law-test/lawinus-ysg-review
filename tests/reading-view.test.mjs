import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_READING_VIEW,readingVisibility,readingPane,withReadingFocus,withReadingSurface} from '../src/reading-view.ts';

test('reading focus hides surrounding panels without changing the saved normal view',()=>{
 const normal={...DEFAULT_READING_VIEW,header:false,footnotes:false};
 const focused=withReadingFocus(normal,true);
 assert.deepEqual(readingVisibility(focused,true,true),{header:false,tools:false,footnotes:false,sidebar:false,metadata:false});
 assert.deepEqual(withReadingFocus(focused,false),normal);
 assert.deepEqual(readingVisibility(normal,false,true),{header:false,tools:true,footnotes:false,sidebar:false,metadata:true});
 assert.equal(DEFAULT_READING_VIEW.focus,false);
});
test('focus always shows a document on mobile and normal mode restores the selected panel',()=>{
 const focused=withReadingFocus(DEFAULT_READING_VIEW,true);
 for(const pane of ['contents','metadata','thesis'])assert.equal(readingPane(focused,pane),'thesis');
 assert.equal(readingPane(focused,'source'),'source');
 assert.equal(readingPane(DEFAULT_READING_VIEW,'metadata'),'metadata');
 assert.equal(readingPane(DEFAULT_READING_VIEW,'contents'),'contents');
});


test('focused view can reveal only the requested panel without replacing normal preferences',()=>{
 const normal={...DEFAULT_READING_VIEW,header:false,tools:false};
 const focused=withReadingSurface(withReadingFocus(normal,true),'metadata',true);
 assert.deepEqual(readingVisibility(focused,true,true),{header:false,tools:false,footnotes:false,sidebar:false,metadata:true});
 assert.equal(readingPane(focused,'metadata'),'metadata');
 assert.equal(readingPane(focused,'contents'),'thesis');
 assert.deepEqual(withReadingFocus(focused,false),normal);
 const freshFocus=withReadingFocus(withReadingFocus(focused,false),true);
 assert.equal(readingVisibility(freshFocus,true,true).metadata,false);
});
