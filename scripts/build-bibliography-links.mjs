import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {paragraphs}=JSON.parse(fs.readFileSync(path.join(root,'src/paragraph-catalog.json'),'utf8'));
const {sources}=JSON.parse(fs.readFileSync(path.join(root,'../generated/manifest.json'),'utf8'));
const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const headings=new Set(['P0819','P0820','P0830','P0896','P0897','P0909','P0930']);
// These title variants were checked against the catalog's author, year and volume.
// A match identifies the work, not whether the available file is a full volume.
const reviewed={
 P0822:'s-e40bb435bf6f1471',P0861:'s-106fc65346912cdd',P0872:'s-3273a2f0bdd7102e',
 P0905:'s-2829fba91cd5824e',P0911:'s-fa4aee8b5238c8ff',P0912:'s-f2966b005d5a3b8e',
 P0915:'s-66bb7449afc4f413',P0916:'s-9cf9e455f785ff57',P0917:'s-8eb8ce14ff2857c1',
 P0918:'s-5ed65dea9df2e21d',P0919:'s-1bb8382bd4d7688b',P0922:'s-72f56bb315708992',
 P0923:'s-13f75cea1f846abf',P0924:'s-613b986663d71daf',P0926:'s-9720c2845193256c',
 P0927:'s-c23f67c14f387053',P0929:'s-fa89ffd0e503fe88',
};
const candidates={P0901:'s-2f4a26a222b895d6',P0902:'s-1cc0812e0e1d0260'};
let previousAuthor='';const entries={};
for(const p of paragraphs.filter(p=>p.page>=197&&p.page<=207&&!headings.has(p.id))){
 let expanded=p.text;
 if(/^―{2,}/.test(expanded))expanded=expanded.replace(/^―{2,}/,previousAuthor);
 else previousAuthor=expanded.split(',')[0];
 const exact=sources.filter(s=>normalize(s.title)===normalize(expanded));
 const sourceId=exact.length===1?exact[0].id:reviewed[p.id];
 entries[p.id]={text:p.text,page:p.page,sourceIds:sourceId?[sourceId]:[],candidateSourceIds:candidates[p.id]?[candidates[p.id]]:[],status:sourceId?'matched':candidates[p.id]?'candidate':'unavailable',basis:sourceId?(exact.length===1?'full-citation-match':'reviewed-author-title-year-volume'):candidates[p.id]?'title-variant-requires-confirmation':'no-catalog-match'};
 for(const id of [...entries[p.id].sourceIds,...entries[p.id].candidateSourceIds])if(!sources.some(s=>s.id===id))throw Error('Unknown source: '+id);
}
if(Object.keys(entries).length!==109)throw Error('Unexpected bibliography size');
const result={schemaVersion:1,description:'논문 말미 참고문헌과 기존 원전 목록의 연결. 제목 변형 후보는 자동으로 열지 않음.',entries};
fs.writeFileSync(path.join(root,'src/bibliography-links.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({entries:Object.keys(entries).length,matched:Object.values(entries).filter(e=>e.status==='matched').length,available:Object.values(entries).filter(e=>e.sourceIds.some(id=>sources.find(s=>s.id===id)?.available!==false)).length,candidates:Object.values(entries).filter(e=>e.status==='candidate').length,unavailable:Object.values(entries).filter(e=>e.status==='unavailable').map(e=>e.text)},null,2));
