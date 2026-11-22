export const EDITION='ysg-20261121';
export const FAVORITES_KEY='ysg:glossary:ysg-20261121:favorites:v1';
export const LANGUAGES={en:'영어',ja:'일본어',de:'독일어',la:'라틴어',fr:'프랑스어'};
export function normalize(text){return String(text??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim().toLocaleLowerCase('en');}
export function firstPage(entry){return Math.min(...entry.occurrences.map(o=>o.page));}
export function paperLink(page){return Number.isInteger(page)&&page>=1&&page<=209?'/?paperPage='+page:null;}
export function dictionaryLink(entry){
  const q=encodeURIComponent(entry.term);
  if(entry.language==='en')return 'https://dictionary.cambridge.org/search/direct/?datasetsearch=english&q='+q;
  if(entry.language==='ja')return 'https://kotobank.jp/search?q='+q;
  if(entry.language==='fr')return 'https://fr.wiktionary.org/w/index.php?search='+q;
  if(entry.language==='de')return 'https://www.duden.de/suchen/dudenonline/'+q;
  return 'https://en.wiktionary.org/w/index.php?search='+q;
}
export function locationLabel(location){
  const range=location.endPage&&location.endPage!==location.page&&location.endPrinted!==undefined?'–'+location.endPrinted:'';
  const page=location.printed!==undefined&&String(location.printed)!==''?String(location.printed)+range+'쪽':'PDF '+location.page+'쪽';
  return page+(location.kind==='note'&&location.noteNumber?' · 각주 '+location.noteNumber:location.kind==='abstract'?' · 영문초록':location.kind==='body'?' · 본문':'');
}
export function uniqueLocations(entry){
  const seen=new Set();return entry.occurrences.filter(o=>{const key=[o.page,o.printed,o.kind,o.noteNumber].join('|');if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>a.page-b.page||(a.noteNumber||0)-(b.noteNumber||0));
}
export function parseFavorites(value,entries){
  try{const ids=new Set(entries.map(e=>e.id));const parsed=JSON.parse(value??'[]');return new Set(Array.isArray(parsed)?parsed.filter(id=>typeof id==='string'&&ids.has(id)):[]);}catch{return new Set();}
}
export function selectEntries(entries,filters,favorites=new Set()){
  const tokens=normalize(filters.query).split(' ').filter(Boolean);
  const selected=entries.filter(e=>
    (filters.language==='all'||e.language===filters.language)&&
    (filters.category==='all'||e.category===filters.category)&&
    (!filters.favoritesOnly||favorites.has(e.id))&&
    tokens.every(token=>normalize([e.term,e.meaning,e.contextMeaning,e.category,...(e.forms||[])].join(' ')).includes(token)));
  return selected.sort((a,b)=>{
    if(filters.sort==='core')return entries.indexOf(a)-entries.indexOf(b);
    if(filters.sort==='frequency'&&a.frequency!==b.frequency)return b.frequency-a.frequency;
    if(filters.sort==='alphabetical')return a.term.localeCompare(b.term,'en')||a.id.localeCompare(b.id);
    return firstPage(a)-firstPage(b)||a.id.localeCompare(b.id);
  });
}
export function validateData(data){
  if(data?.edition!==EDITION||!Array.isArray(data.entries)||!data.entries.length)throw Error('논문 판본과 용어 목록을 확인하지 못했습니다.');
  const ids=new Set();
  for(const e of data.entries){
    if(!e||typeof e.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(e.id)||ids.has(e.id)||!e.term||typeof e.term!=='string'||!e.meaning||typeof e.meaning!=='string'||!LANGUAGES[e.language]||!Number.isInteger(e.frequency)||e.frequency<1||!Array.isArray(e.occurrences)||!e.occurrences.length)throw Error('용어 항목을 확인하지 못했습니다.');
    ids.add(e.id);
    for(const o of e.occurrences)if(!paperLink(o.page))throw Error('논문 위치를 확인하지 못했습니다.');
  }
  return data;
}
