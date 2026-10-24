import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const module={exports:{}};
const source=readFileSync(new URL('../src/proposal-indicators.ts',import.meta.url),'utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports});
const {buildProposalIndicators,proposalLabel,pageProposalMarkers,placeProposalMarkers}=module.exports;
const paragraph=(id,text,page=1,kind='paragraph')=>({id,text,page,kind});
const proposal=(id,priority,before='본문',page=1,extra={})=>({id,priority,before,page,...extra});

test('multiple anchored proposals use only their recorded highest priority and retain all links',()=>{
 const paragraphs=[paragraph('P0001','원문입니다.')];
 const map=buildProposalIndicators([proposal('INSERT_AFTER_P0001','강하게 권고'),proposal('P0001','반드시 수정'),proposal('other','선택적','본문',1,{anchorId:'P0001'})],paragraphs);
 assert.equal(map.P0001.priority,'반드시 수정');assert.equal(map.P0001.primaryProposalId,'P0001');assert.equal(map.P0001.proposalIds.length,3);
 assert.match(proposalLabel(map.P0001),/수정제안 있음 · 반드시 수정 · 3건/);
});
test('deletions remain indicators and footnote or unknown priority records never invent paragraph urgency',()=>{
 const ps=[paragraph('P0001','삭제되는 문단입니다.')];
 const map=buildProposalIndicators([proposal('P0001','선택적','삭제되는 문단입니다.',1,{applyText:''}),proposal('FN1','반드시 수정','삭제되는 문단입니다.'),proposal('unknown','매우 중요','삭제되는 문단입니다.')],ps);
 assert.equal(map.P0001.priority,'선택적');assert.equal(map.P0001.proposalIds.length,1);
});
test('grouped original lines match the recorded page span without matching generic headings or other pages',()=>{
 const ps=[paragraph('P0001','현 행',1,'table_row'),paragraph('P0002','기존 조문 내용이 충분히 긴 첫 행',1,'table_row'),paragraph('P0003','새 조문 내용이 충분히 긴 다음 행',2,'table_row'),paragraph('P0004','새 조문 내용이 충분히 긴 다음 행',3,'table_row')];
 const map=buildProposalIndicators([proposal('P0002','강하게 권고','현 행\n\n기존 조문 내용이 충분히 긴 첫 행\n새 조문 내용이 충분히 긴 다음 행',1,{page_end:2})],ps);
 assert.deepEqual(Object.keys(map).sort(),['P0002','P0003']);
});
test('one grouped proposal gets one margin marker per page and never borrows footnote geometry',()=>{
 const ps=[paragraph('P0001','충분히 길게 기재된 첫 번째 문단'),paragraph('P0002','충분히 길게 기재된 두 번째 문단')];
 const map=buildProposalIndicators([proposal('P0001','반드시 수정','충분히 길게 기재된 첫 번째 문단\n충분히 길게 기재된 두 번째 문단')],ps);
 const targets=[{page:1,rect:[60,100,400,120],noteId:'P0001',number:1,kind:'paragraph'},{page:1,rect:[70,70,400,90],noteId:'P0002',number:2,kind:'paragraph'},{page:1,rect:[80,1,90,10],noteId:'P0001',number:1,kind:'footnote-text'},{page:2,rect:[60,30,400,50],noteId:'P0001',number:1,kind:'paragraph'}];
 const markers=pageProposalMarkers(targets,map);assert.equal(markers.length,2);assert.equal(markers[0].target.noteId,'P0002');assert.equal(markers[1].target.page,2);
});
test('every public human paragraph proposal is represented without changing manuscript or priority data',()=>{
 const proposals=JSON.parse(readFileSync(new URL('../src/revision-proposals.json',import.meta.url),'utf8')).items;
 const paragraphs=JSON.parse(readFileSync(new URL('../src/paragraph-catalog.json',import.meta.url),'utf8')).paragraphs;
 const ids=new Set(paragraphs.map(p=>p.id));const snapshot=JSON.stringify(proposals),map=buildProposalIndicators(proposals,paragraphs);
 for(const p of proposals.filter(p=>ids.has(p.id))){assert.ok(map[p.id],p.id);assert.ok(map[p.id].proposalIds.includes(p.id),p.id);}
 assert.equal(JSON.stringify(proposals),snapshot);assert.ok(Object.keys(map).every(id=>ids.has(id)));
});

test('small PDF column labels remain separated while original paragraph coordinates are unchanged',()=>{
 const targets=[{page:1,rect:[60,200,400,225],noteId:'P0001',number:1,kind:'paragraph'},{page:1,rect:[60,227,400,252],noteId:'P0002',number:2,kind:'paragraph'}];
 const map=buildProposalIndicators([proposal('P0001','반드시 수정'),proposal('P0002','강하게 권고')],[paragraph('P0001','본문1'),paragraph('P0002','본문2')]);
 const snapshot=JSON.stringify(targets),placed=placeProposalMarkers(pageProposalMarkers(targets,map),424,728,22);
 assert.ok(placed[1].top-placed[0].top>=24);assert.equal(JSON.stringify(targets),snapshot);
 assert.ok(placed.every(x=>x.top>=0&&x.top+22<=424));
});
