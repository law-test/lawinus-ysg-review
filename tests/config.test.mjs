import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReviewConfig} from '../src/review-api.ts';
const url='https://exampleproject.supabase.co';
test('관리자 키를 배포 설정으로 사용하지 않는다',()=>{
  assert.throws(()=>validateReviewConfig({supabaseUrl:url,supabasePublishableKey:'sb_secret_test'}));
  const jwt='x.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.y';
  assert.throws(()=>validateReviewConfig({supabaseUrl:url,supabasePublishableKey:jwt}));
});
test('빈 설정이나 임의 목적지를 배포하지 않는다',()=>{
  assert.throws(()=>validateReviewConfig({}));
  assert.throws(()=>validateReviewConfig({supabaseUrl:'https://other.example',supabasePublishableKey:'sb_publishable_test'}));
});
test('공개 설정은 논문 데이터셋과 독립 Storage를 지정한다',()=>{
  const c=validateReviewConfig({supabaseUrl:url,supabasePublishableKey:'sb_publishable_test'});
  assert.equal(c.storageBucket,'ysg-review-documents');assert.equal(c.datasetId,'ysg-20261023');
});
