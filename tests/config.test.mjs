import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReviewConfig,reviewAuthStorageKey,reviewAssetStorageKey} from '../src/review-api.ts';
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
  assert.equal(c.storageBucket,'ysg-review-documents');assert.equal(c.datasetId,'ysg-20261024');
});

test('새 판본은 기존 방문자 연결과 원전을 이어 쓰고 원고·편집 기준본은 분리한다',()=>{
  const old=validateReviewConfig({supabaseUrl:url,supabasePublishableKey:'sb_publishable_test',datasetId:'ysg-20261023'});
  const current=validateReviewConfig({...old,datasetId:'ysg-20261024',authDatasetId:'ysg-20261023',sourceDatasetId:'ysg-20261023'});
  assert.equal(reviewAuthStorageKey(current),reviewAuthStorageKey(old));
  assert.equal(reviewAssetStorageKey(current,'thesis'),'ysg-20261024/human.pdf');
  assert.equal(reviewAssetStorageKey(current,'manifest'),'ysg-20261024/manifest.json');
  assert.equal(reviewAssetStorageKey(current,'profile'),'ysg-20261024/profile.json');
  assert.equal(reviewAssetStorageKey(current,'s-existing'),'ysg-20261023/assets/s-existing');
  assert.equal(reviewAssetStorageKey(old,'s-existing'),'ysg-20261023/assets/s-existing');
});

test('판본별 연결은 상대경로·외부 주소·빈 식별자를 거절한다',()=>{
  const base={supabaseUrl:url,supabasePublishableKey:'sb_publishable_test'};
  for(const field of ['authDatasetId','sourceDatasetId'])for(const value of ['',null,42,'../old','https://other.example','old/new','old\\new','old%2fnew']){
    assert.throws(()=>validateReviewConfig({...base,[field]:value}));
  }
  const config=validateReviewConfig(base);
  for(const id of ['../human.pdf','https://other.example','s-../human','s-key?download=1',''])assert.throws(()=>reviewAssetStorageKey(config,id));
});
