import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {DEFAULT_TEXT_SIZE, normalizeTextSize, readTextSize, applyTextSize, TEXT_SIZE_STORAGE_KEY} from '../src/text-size.ts';

test('text starts 50 percent larger and accepts only menu sizes',()=>{
 assert.equal(DEFAULT_TEXT_SIZE,150);
 for (const value of [null,undefined,'',0,1.5,NaN,Infinity,'999']) assert.equal(normalizeTextSize(value),150);
 for (const size of [100,125,150,175,200]) assert.equal(normalizeTextSize(String(size)),size);
});
test('chosen size persists and storage failures do not break reading',()=>{
 const props=new Map(), saved=new Map();
 globalThis.document={documentElement:{style:{setProperty:(key,value)=>props.set(key,value)},dataset:{}}};
 globalThis.localStorage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)};
 assert.equal(readTextSize(),150);
 applyTextSize(175);
 assert.equal(props.get('--review-font-scale'),'1.75');
 assert.equal(saved.get(TEXT_SIZE_STORAGE_KEY),'175');
 assert.equal(readTextSize(),175);
 globalThis.localStorage={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')}};
 assert.equal(readTextSize(),150);
 assert.equal(applyTextSize(150),150);
 delete globalThis.document;delete globalThis.localStorage;
});
test('font scaling leaves PDF text-layer coordinates and rendering scale intact',()=>{
 const css=readFileSync(new URL('../src/review.css',import.meta.url),'utf8');
 const layer=css.slice(css.indexOf('.textLayer {'),css.indexOf('.review-app {'));
 assert.ok(!layer.includes('--review-font-scale'));
 const manuscript=readFileSync(new URL('../src/web-manuscript.css',import.meta.url),'utf8');
 assert.ok(manuscript.includes('var(--manuscript-zoom,1) * var(--review-font-scale,1.5)'));
 const controls=readFileSync(new URL('../src/text-size-control.tsx',import.meta.url),'utf8');
 assert.ok(controls.includes('aria-label="화면 글자 크기"'));
 assert.ok(controls.includes("addEventListener('storage'"));
});
