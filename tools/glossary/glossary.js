import {FAVORITES_KEY,LANGUAGES,validateData,parseFavorites,selectEntries,uniqueLocations,locationLabel,paperLink,dictionaryLink} from './glossary-model.mjs?v=ysg-20261121-005';
const byId=id=>document.getElementById(id);
const controls={query:byId('query'),language:byId('language'),category:byId('category'),sort:byId('sort'),favoritesOnly:byId('favorites-only')};
let data=null,favorites=new Set(),memoryOnly=false;
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
function link(text,url,className){const el=node('a',text,className);el.href=url;el.target='_blank';el.rel='noopener noreferrer';return el;}
function filterValues(){return {query:controls.query.value,language:controls.language.value,category:controls.category.value,sort:controls.sort.value,favoritesOnly:controls.favoritesOnly.checked};}
function voiceLanguage(language){return {en:'en-US',ja:'ja-JP',de:'de-DE',fr:'fr-FR',la:'la'}[language];}
function speechSupported(language){return 'speechSynthesis' in window&&'SpeechSynthesisUtterance' in window&&(language!=='la'||window.speechSynthesis.getVoices().some(v=>v.lang.toLowerCase().startsWith('la')));}
function speak(entry){
  if(!speechSupported(entry.language))return;window.speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(entry.term);utterance.lang=voiceLanguage(entry.language);utterance.rate=.85;
  const voice=window.speechSynthesis.getVoices().find(v=>v.lang.toLowerCase().startsWith(entry.language));if(voice)utterance.voice=voice;
  utterance.onstart=()=>{byId('speech-status').textContent=entry.term+' · 합성음성으로 읽는 중';};utterance.onend=()=>{byId('speech-status').textContent='';};
  utterance.onerror=e=>{if(!['canceled','interrupted'].includes(e.error))byId('speech-status').textContent='이 기기에서 발음을 재생하지 못했습니다.';};window.speechSynthesis.speak(utterance);
}
function saveFavorites(){try{localStorage.setItem(FAVORITES_KEY,JSON.stringify([...favorites]));}catch{memoryOnly=true;}byId('storage-status').textContent=memoryOnly?'즐겨찾기는 이 창에서만 유지됩니다.':'';}
function locationLinks(locations,className){const box=node('div',undefined,className);for(const loc of locations)box.append(link(locationLabel(loc),paperLink(loc.page)));return box;}
function card(entry){
  const article=node('article',undefined,'entry'),headingId='term-'+entry.id;article.setAttribute('aria-labelledby',headingId);
  const header=node('div',undefined,'entry-header'),heading=node('div',undefined,'entry-heading'),title=node('h3',entry.term);title.id=headingId;title.lang=entry.language;heading.append(title,node('p',entry.meaning,'meaning'));
  const meta=node('div',undefined,'entry-meta');meta.append(node('span',LANGUAGES[entry.language]));if(entry.category)meta.append(node('span',entry.category));meta.append(node('span','논문에서 '+entry.frequency+'회'));heading.append(meta);
  const actions=node('div',undefined,'entry-actions'),voice=node('button',speechSupported(entry.language)?'발음 듣기':'발음 미지원');voice.type='button';voice.disabled=!speechSupported(entry.language);voice.className='speak-button';voice.dataset.language=entry.language;voice.setAttribute('aria-label',entry.term+' '+LANGUAGES[entry.language]+' 발음 듣기');voice.addEventListener('click',()=>speak(entry));
  const favorite=node('button',favorites.has(entry.id)?'즐겨찾기 해제':'즐겨찾기');favorite.type='button';favorite.id='favorite-'+entry.id;favorite.setAttribute('aria-pressed',String(favorites.has(entry.id)));favorite.setAttribute('aria-label',entry.term+' '+(favorites.has(entry.id)?'즐겨찾기 해제':'즐겨찾기 추가'));
  favorite.addEventListener('click',()=>{if(favorites.has(entry.id))favorites.delete(entry.id);else favorites.add(entry.id);saveFavorites();render();(byId(favorite.id)||controls.favoritesOnly).focus();});actions.append(voice,favorite);header.append(heading,actions);article.append(header);
  if(entry.contextMeaning)article.append(node('p',entry.contextMeaning,'context-meaning'));
  if(entry.forms?.length){const forms=entry.forms.filter(f=>f!==entry.term);if(forms.length)article.append(node('p','함께 찾기: '+forms.join(' · '),'forms'));}
  const locations=uniqueLocations(entry);article.append(node('p','논문에서 보기','entry-location-title'),locationLinks(locations.slice(0,4),'locations'));
  if(locations.length>4){const more=node('details'),summary=node('summary','사용 위치 '+(locations.length-4)+'곳 더 보기');more.append(summary,locationLinks(locations.slice(4),'locations more-locations'));article.append(more);}
  const external=link('외부 사전에서 찾기',dictionaryLink(entry),'external-link');external.setAttribute('aria-label',entry.term+' 외부 사전에서 찾기 (새 창)');article.append(external);return article;
}
function render(){if(!data)return;const list=selectEntries(data.entries,filterValues(),favorites),fragment=document.createDocumentFragment();for(const entry of list)fragment.append(card(entry));byId('entries').replaceChildren(fragment);byId('empty').hidden=list.length!==0;byId('result-count').textContent='전체 '+data.entries.length+'개 중 '+list.length+'개';}
function options(select,values,label){select.replaceChildren(node('option',label));select.options[0].value='all';for(const [value,text]of values){const option=node('option',text);option.value=value;select.append(option);}}
async function load(){
  byId('error').hidden=true;byId('result-count').textContent='논문 단어사전을 불러오는 중…';
  try{
    const response=await fetch('./glossary-data.json?v=ysg-20261121-005',{cache:'no-cache'});if(!response.ok)throw Error('자료 응답 오류');data=validateData(await response.json());
    try{favorites=parseFavorites(localStorage.getItem(FAVORITES_KEY),data.entries);}catch{memoryOnly=true;favorites=new Set();}
    options(controls.language,Object.entries(LANGUAGES).filter(([code])=>data.entries.some(e=>e.language===code)),'전체 언어');options(controls.category,[...new Set(data.entries.map(e=>e.category).filter(Boolean))].map(c=>[c,c]),'전체 주제');
    if(data.sourceTitle)byId('source-title').textContent='출전: '+data.sourceTitle;if(data.scope)byId('scope').textContent=data.scope;
    byId('storage-status').textContent=memoryOnly?'즐겨찾기는 이 창에서만 유지됩니다.':'';render();
  }catch{data=null;byId('entries').replaceChildren();byId('result-count').textContent='';byId('error').hidden=false;}
}
byId('filters').addEventListener('submit',e=>e.preventDefault());for(const [name,control]of Object.entries(controls))control.addEventListener(name==='query'?'input':'change',render);
byId('reset').addEventListener('click',()=>{controls.query.value='';controls.language.value='all';controls.category.value='all';controls.sort.value='core';controls.favoritesOnly.checked=false;render();controls.query.focus();});byId('retry').addEventListener('click',load);
if('speechSynthesis'in window)window.speechSynthesis.addEventListener('voiceschanged',()=>{for(const button of document.querySelectorAll('.speak-button')){const supported=speechSupported(button.dataset.language);button.disabled=!supported;button.textContent=supported?'발음 듣기':'발음 미지원';}});
window.addEventListener('pagehide',()=>{if('speechSynthesis'in window)window.speechSynthesis.cancel();});load();
