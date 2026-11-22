'use strict';
// The OCR worker may read only its pinned, same-origin engine and language models.
const allowed=new Set(['worker.min.js','tesseract-core-lstm.wasm.js','kor.traineddata.gz','eng.traineddata.gz'].map(name=>new URL(name,self.location.href).href));
const originalFetch=self.fetch.bind(self);
self.fetch=(input,init={})=>{
  const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url,self.location.href);
  const method=String(init.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  if(method!=='GET'||(!allowed.has(url.href)&&url.protocol!=='data:'))return Promise.reject(new TypeError('Unavailable OCR resource'));
  return originalFetch(input,{...init,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
};
const originalImport=self.importScripts.bind(self);
self.importScripts=(...urls)=>{
  if(urls.some(path=>!allowed.has(new URL(path,self.location.href).href)))throw new TypeError('Unavailable OCR script');
  return originalImport(...urls);
};
self.importScripts(new URL('worker.min.js',self.location.href).href);
