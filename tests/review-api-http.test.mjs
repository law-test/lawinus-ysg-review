import assert from 'node:assert/strict';
import { test } from 'node:test';
import officialCases from '../src/official-cases.json' with {type:'json'};

test('Supabase client boundary: public reads, single anonymous initialization, owner writes and conflict errors', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const calls = [];
  const caseRefs=[...officialCases.cases,...officialCases.confirmedExistingSourceRefs||[],...officialCases.unavailableCaseRefs||[]];
  const manifest={meta:{pdfSha256:officialCases.pdfSha256},sources:caseRefs.filter(item=>!item.newSource).map(item=>({id:item.sourceId,available:!officialCases.unavailableCaseRefs?.some(missing=>missing.sourceId===item.sourceId),kind:'text'})),notes:[...new Set(caseRefs.flatMap(item=>item.noteIds))].map(id=>({id,text:'각주 원문',sourceRefs:[]}))};
  let configReads = 0;
  let signups = 0;
  const uid = '10000000-0000-4000-8000-000000000001';
  const payload = Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  const token = `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`;
  globalThis.document = { baseURI:'https://ysg.lawinus.org/' };
  globalThis.fetch = async (input,init={}) => {
    const url = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({url:url.href,method:init.method||'GET',body,headers:new Headers(init.headers)});
    if (url.pathname === '/config.json') {
      configReads++;
      return Response.json({supabaseUrl:'https://abcdefghijklmnopqrst.supabase.co',supabasePublishableKey:'sb_publishable_fixture',storageBucket:'ysg-review-documents',datasetId:officialCases.datasetId,authDatasetId:'ysg-20261023',sourceDatasetId:'ysg-20261023'});
    }
    if (url.pathname.endsWith('/manifest.json')) return Response.json(manifest);
    if (url.pathname === '/auth/v1/signup') {
      signups++;
      await new Promise(resolve=>setTimeout(resolve,15));
      return Response.json({access_token:token,refresh_token:'fixture-refresh',expires_in:3600,token_type:'bearer',user:{id:uid,aud:'authenticated',role:'authenticated',is_anonymous:true,created_at:'2026-10-23T00:00:00Z',app_metadata:{},user_metadata:{}}});
    }
    if (url.pathname === '/rest/v1/rpc/paper_review_list_notes') return Response.json({notes:[],truncated:false});
    if (url.pathname === '/rest/v1/rpc/paper_review_create_note') return Response.json({note:{id:uid,visibility:'private'}});
    if (url.pathname === '/rest/v1/rpc/paper_review_update_note') return Response.json({code:'PT409',message:'stale'}, {status:409});
    if (url.pathname === '/rest/v1/rpc/paper_review_delete_note') return Response.json({deleted:uid});
    throw new Error(`Unmocked endpoint: ${url.href}`);
  };
  try {
    const adapter = await import('../src/review-api.ts?boundary-test');
    await Promise.all([adapter.loadReviewConfig(),adapter.loadReviewConfig()]);
    assert.equal(configReads,1);
    await adapter.api('/api/notes');
    assert.equal(signups,0,'public list must not create identities');
    const merged=await adapter.api('/api/manifest');
    assert.equal(merged.meta.pdfSha256,manifest.meta.pdfSha256);
    for(const item of officialCases.cases){
      assert.equal(merged.sources.find(s=>s.id===item.sourceId).available,true);
      assert.equal(adapter.assetUrl(item.sourceId),'https://ysg.lawinus.org/'+item.assetPath);
    }
    assert.equal(signups,0,'document lookup must not create identities');
    assert.equal(adapter.assetUrl('thesis'),`https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/ysg-review-documents/${officialCases.datasetId}/human.pdf`);
    assert.equal(adapter.assetUrl('s-existing'),'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/ysg-review-documents/ysg-20261023/assets/s-existing');
    assert.throws(()=>adapter.assetUrl('../private'));
    const sessions=await Promise.all([adapter.initializeReviewSession(),adapter.initializeReviewSession(),adapter.initializeReviewSession()]);
    assert.equal(signups,1,'concurrent initialization must create one identity');
    assert.equal(sessions[0].user.mode,'guest');
    assert.equal(sessions[0].user.displayName,'방문자 000001');
    assert.equal(JSON.stringify(sessions).includes(uid),false,'returned session must not expose full owner ID/token');
    await adapter.initializeReviewSession();
    assert.equal(signups,1,'existing session must be reused');
    await adapter.api('/api/notes',{method:'POST',body:JSON.stringify({text:'메모'})});
    const create=calls.find(c=>c.url.endsWith('/paper_review_create_note'));
    assert.equal(create.body.p_dataset_id,officialCases.datasetId);
    assert.equal(create.headers.get('authorization'),`Bearer ${token}`);
    assert.deepEqual(create.body.p_input,{text:'메모'});
    await assert.rejects(()=>adapter.api(`/api/notes/${uid}`,{method:'PATCH',body:JSON.stringify({revision:1,text:'변경'})}),/다른 화면/);
    const deleted=await adapter.api(`/api/notes/${uid}`,{method:'DELETE',body:JSON.stringify({revision:1})});
    assert.equal(deleted.deleted,uid);
    await assert.rejects(()=>adapter.api('https://evil.example/api/notes'),/허용되지/);
    await assert.rejects(()=>adapter.api('/api/notes',{method:'POST',body:JSON.stringify({text:'x'.repeat(64001)})}),/너무 큽니다/);
  } finally {
    globalThis.fetch=originalFetch;
    globalThis.document=originalDocument;
  }
});
