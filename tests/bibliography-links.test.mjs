import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const {entries}=read('../src/bibliography-links.json');
const {paragraphs}=read('../src/paragraph-catalog.json');
const {sources}=read('./fixtures/bibliography-sources.json');
const headings=new Set(['P0819','P0820','P0830','P0896','P0897','P0909','P0930']);
test('every bibliography entry retains its exact original citation and valid catalog references',()=>{
 const bibliography=paragraphs.filter(p=>p.page>=197&&p.page<=207&&!headings.has(p.id));
 assert.equal(bibliography.length,109);assert.deepEqual(Object.keys(entries),bibliography.map(p=>p.id));
 for(const p of bibliography){const e=entries[p.id];assert.equal(e.text,p.text,p.id);assert.equal(e.page,p.page,p.id);
  for(const id of [...e.sourceIds,...e.candidateSourceIds])assert.ok(sources.some(s=>s.id===id),id);
  assert.equal(e.sourceIds.length,e.status==='matched'?1:0,p.id);
 }
});
test('confirmed, candidate and unavailable references remain distinct, including excerpts and the 2010 ministry title',()=>{
 const values=Object.values(entries);assert.equal(values.filter(e=>e.status==='matched').length,105);
 assert.equal(values.filter(e=>e.sourceIds.some(id=>sources.find(s=>s.id===id).available!==false)).length,87);
 assert.equal(values.filter(e=>e.status==='candidate').length,2);assert.equal(values.filter(e=>e.status==='unavailable').length,2);
 assert.equal(entries.P0822.sourceIds[0],'s-e40bb435bf6f1471');
 assert.match(sources.find(s=>s.id===entries.P0822.sourceIds[0]).title,/2010/);
 assert.notEqual(entries.P0822.sourceIds[0],entries.P0823.sourceIds[0]);
 assert.equal(entries.P0905.sourceIds[0],'s-2829fba91cd5824e');
 assert.equal(sources.find(s=>s.id===entries.P0905.sourceIds[0]).displayMode,'excerpt');
 assert.deepEqual(entries.P0901.sourceIds,[]);assert.deepEqual(entries.P0902.sourceIds,[]);
 assert.deepEqual(entries.P0843.sourceIds,[]);assert.deepEqual(entries.P0931.sourceIds,[]);
});
