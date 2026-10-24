import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createPdfRuntimeCache} from '../src/pdf-viewer-model.ts';

const vendor=new URL('../public/vendor/pdfjs/',import.meta.url);
const legacy=new URL('legacy-6.4.299/',vendor);
const missing=`Promise.withResolvers=undefined;Promise.try=undefined;Uint8Array.fromBase64=undefined;Uint8Array.prototype.toBase64=undefined;`;
function run(code){const r=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',code],{encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr+r.stdout);return JSON.parse(r.stdout.trim().split('\n').at(-1));}

function onePagePdf(){
 const parts=['%PDF-1.4\n'],offsets=[0];
 for(const [i,body] of ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>'].entries()){
  offsets.push(parts.join('').length);parts.push(`${i+1} 0 obj\n${body}\nendobj\n`);
 }
 const xref=parts.join('').length;
 parts.push(`xref\n0 4\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
 return parts.join('');
}

test('the old modern PDF runtime reproduces a missing withResolvers failure',()=>{
  const result=run(`${missing} const m=await import(${JSON.stringify(new URL('pdf.mjs',vendor).href)});try{await m.getDocument({data:new Uint8Array()}).promise;process.exit(2);}catch(e){console.log(JSON.stringify({name:e.name,message:e.message}));}`);
  assert.equal(result.name,'TypeError');assert.match(result.message,/withResolvers/);
});

test('legacy display and worker bootstrap restore missing APIs and parse a PDF',()=>{
  const parts=['%PDF-1.4\n'];const offsets=[0];
  for(const [i,body] of ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>'].entries()){
    offsets.push(parts.join('').length);parts.push(`${i+1} 0 obj\n${body}\nendobj\n`);
  }
  const xref=parts.join('').length;
  parts.push(`xref\n0 4\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const result=run(`${missing} await import(${JSON.stringify(new URL('pdf.compat.mjs',legacy).href)});const m=await import(${JSON.stringify(new URL('pdf.mjs',legacy).href)});m.GlobalWorkerOptions.workerSrc=${JSON.stringify(new URL('pdf.worker.bootstrap.mjs',legacy).href)};const task=m.getDocument({data:new TextEncoder().encode(${JSON.stringify(parts.join(''))})});const d=await task.promise,p=await d.getPage(1);console.log(JSON.stringify({version:m.version,pages:d.numPages,view:p.view,withResolvers:typeof Promise.withResolvers,promiseTry:typeof Promise.try,fromBase64:typeof Uint8Array.fromBase64,toBase64:typeof Uint8Array.prototype.toBase64}));await task.destroy();`);
  assert.deepEqual(result,{version:'6.4.299',pages:1,view:[0,0,612,792],withResolvers:'function',promiseTry:'function',fromBase64:'function',toBase64:'function'});
});

test('worker bootstrap installs its own compatibility function in a fresh realm',()=>{
  const result=run(`${missing} const w=await import(${JSON.stringify(new URL('pdf.worker.bootstrap.mjs',legacy).href)});const cap=Promise.withResolvers();cap.resolve(7);console.log(JSON.stringify({handler:typeof w.WorkerMessageHandler,resolved:await cap.promise,promiseTry:typeof Promise.try}));`);
  assert.deepEqual(result,{handler:'function',resolved:7,promiseTry:'function'});
});

test('mobile fallback raster dimensions do not change PDF CSS geometry or the native source link',()=>{
  const source=readFileSync(new URL('../src/pdf-viewer.tsx',import.meta.url),'utf8');
  assert.ok(source.includes("cv.style.width=vp.width+'px'"));
  assert.ok(source.includes('const visible=renderable?visiblePageRange'));
  assert.ok(source.includes('pdfRuntime=createPdfRuntimeCache'));
  assert.ok(source.includes('await renderSettled.current.catch'));
  assert.ok(source.includes('cv.width=0;cv.height=0'));
  assert.ok(source.includes('href={assetUrl(id)}'));
});

test('an explicit retry replaces a rejected fake-worker cache without destroying another document',()=>{
 const result=run(`
  import {createPdfRuntimeCache} from ${JSON.stringify(new URL('../src/pdf-viewer-model.ts',import.meta.url).href)};
  const base=${JSON.stringify(legacy.href)},text=${JSON.stringify(onePagePdf())};
  const load=async attempt=>{const suffix='?repro='+attempt;await import(base+'pdf.compat.mjs'+suffix);const m=await import(base+'pdf.mjs'+suffix);m.GlobalWorkerOptions.workerSrc=base+'pdf.worker.bootstrap.mjs'+suffix;return m;};
  const cache=createPdfRuntimeCache(load),poisoned=await cache.get();
  poisoned.GlobalWorkerOptions.workerSrc=base+'does-not-exist-repro.mjs';
  async function open(m){const task=m.getDocument({data:new TextEncoder().encode(text)});try{return {task,doc:await task.promise};}catch(e){await task.destroy();return {error:e.message};}}
  const failed=await open(poisoned);
  const workingRuntime=await load('working'),working=await open(workingRuntime);
  poisoned.GlobalWorkerOptions.workerSrc=base+'pdf.worker.bootstrap.mjs';
  const unchanged=await open(await cache.get());
  cache.retry();const fresh=await cache.get(),recovered=await open(fresh);
  const stillWorking=await working.doc.getPage(1);
  console.log(JSON.stringify({firstFailed:!!failed.error,oldRetryStillFails:!!unchanged.error,newRuntime:fresh!==poisoned,recoveredPages:recovered.doc.numPages,otherDocumentPreserved:stillWorking.view[2]===612}));
  await recovered.task.destroy();await working.task.destroy();
 `);
 assert.deepEqual(result,{firstFailed:true,oldRetryStillFails:true,newRuntime:true,recoveredPages:1,otherDocumentPreserved:true});
});

test('a superseded failed import cannot evict the new runtime or trigger automatic reload loops',async()=>{
 const attempts=[];let rejectOld;
 const cache=createPdfRuntimeCache(attempt=>{attempts.push(attempt);return attempt===0?new Promise((_,reject)=>{rejectOld=reject;}):Promise.resolve({attempt});});
 const old=cache.get(),observed=assert.rejects(old,/offline/);await Promise.resolve();
 cache.retry();const current=cache.get();assert.deepEqual(await current,{attempt:1});
 rejectOld(new Error('offline'));await observed;
 assert.equal(cache.get(),current);assert.deepEqual(attempts,[0,1]);
 const failedAttempts=[];const failed=createPdfRuntimeCache(attempt=>{failedAttempts.push(attempt);return Promise.reject(new Error('offline'));});
 await assert.rejects(failed.get(),/offline/);await new Promise(resolve=>setTimeout(resolve,0));
 assert.deepEqual(failedAttempts,[0],'failure must not silently retry');
 await assert.rejects(failed.get(),/offline/);assert.deepEqual(failedAttempts,[0,1]);
});

test('retry query reaches both bootstrap imports and each active document keeps its runtime',()=>{
 const bootstrap=readFileSync(new URL('pdf.worker.bootstrap.mjs',legacy),'utf8');
 assert.ok(bootstrap.includes('new URL(import.meta.url).search'));
 assert.ok(bootstrap.includes("import('./pdf.compat.mjs' + retry)"));
 assert.ok(bootstrap.includes("import('./pdf.worker.mjs' + retry)"));
 const source=readFileSync(new URL('../src/pdf-viewer.tsx',import.meta.url),'utf8');
 assert.ok(source.includes("PDF_RUNTIME+'pdf.worker.bootstrap.mjs'+retry"));
 assert.ok(source.includes('setLoaded({id,doc:document,runtime:m})'));
 assert.ok(source.includes('runtime={loaded!.runtime}'));
 assert.ok(source.includes('layer=new runtime.TextLayer'));
 assert.ok(source.includes('pdfRuntime.retry();setLoadAttempt(value=>value+1)'));
});

test('PDF native pinch zoom is permitted outside the narrow-phone breakpoint as well',()=>{
 const css=readFileSync(new URL('../src/pdf-viewer.css',import.meta.url),'utf8');
 const defaultRules=css.slice(0,css.indexOf('@media'));
 assert.match(defaultRules,/\.pdf-reader>\.continuous-pdf\{[^}]*touch-action:pan-x pan-y pinch-zoom;/);
});
