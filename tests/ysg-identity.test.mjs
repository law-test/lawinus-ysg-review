import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {validateReviewConfig} from '../src/review-api.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('new review identity and domain replace template identity',()=>{
  const html=read('index.html'),workspace=read('src/review-workspace.tsx');
  assert.match(html,/여성곤/);assert.match(html,/민사신탁의 법리에 관한 연구/);
  assert.match(html,/https:\/\/ysg\.lawinus\.org\//);
  assert.equal(read('public/CNAME').trim(),'ysg.lawinus.org');
  for(const text of [html,workspace,read('src/profile-sections.tsx'),read('src/research-achievements.tsx')]) {
    assert.doesNotMatch(text,/김민규|kim-min-gyu|paper\.lawinus\.org|주택임차보증금반환채권|10-2026-0191635/);
  }
  assert.match(workspace,/\[page,setPage\]=useState\(initialPage\)/);
  assert.match(workspace,/thesisContents\.entries\?\.find\(entry=>entry\.kind==='body'\)\?\.page\|\|1/);
  assert.doesNotMatch(workspace,/page-19|page>=20&&page<=263/);
});

test('template profile and document assets are excluded from public bundle',()=>{
  for(const path of ['public/books','public/research','public/translations','public/kim-min-gyu-profile.jpg']) {
    assert.equal(existsSync(new URL('../'+path,import.meta.url)),false,path);
  }
  for(const path of ['src/revision-proposals.json','src/source-translations.json']) {
    const data=JSON.parse(read(path));assert.equal((data.items||data.sources).length,0);
  }
  assert.deepEqual(JSON.parse(read('src/research-achievements.json')),[]);
  assert.deepEqual(JSON.parse(read('src/press-coverage.json')),[]);
});

test('runtime config defaults isolate new review dataset and bucket',()=>{
  const config=validateReviewConfig({supabaseUrl:'https://exampleproject.supabase.co',supabasePublishableKey:'sb_publishable_fixture'});
  assert.equal(config.datasetId,'ysg-20261023');assert.equal(config.storageBucket,'ysg-review-documents');
});

test('library includes unlinked sources and missing originals are disclosed',()=>{
  const text=read('src/review-workspace.tsx');
  assert.match(text,/filteredSources=sources\.filter/);
  assert.match(text,/filteredSources\.map/);
  assert.match(text,/openLibrarySource\(s\.id\)/);
  assert.match(text,/source\.available!==false&&source\.kind!=='pdf'/);
  assert.match(text,/보유 원문 파일이 없는 자료입니다/);
  assert.match(text,/원문 제공 사이트 열기/);
});
