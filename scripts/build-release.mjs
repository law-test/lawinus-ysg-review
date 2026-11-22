import {spawnSync} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
function build(cwd){
  const cli=resolve(cwd,'node_modules/vite/bin/vite.js');
  if(!existsSync(cli))throw Error('Run npm ci in the root and review-source before building.');
  for(const args of [[resolve(cwd,'node_modules/typescript/bin/tsc'),'--noEmit'],[cli,'build']]){
    const result=spawnSync(process.execPath,args,{cwd,stdio:'inherit'});
    if(result.status!==0)process.exit(result.status||1);
  }
}
const review=resolve(root,'review-source');build(review);
const target=resolve(root,'public/review');mkdirSync(target,{recursive:true});
for(const entry of readdirSync(resolve(review,'dist'),{withFileTypes:true})){
  if(['editions','CNAME','config.example.json'].includes(entry.name))continue;
  cpSync(resolve(review,'dist',entry.name),resolve(target,entry.name),{recursive:true});
}
build(root);
console.log('Built the reader and review editor in dist.');
