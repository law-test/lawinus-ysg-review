const mode:string='page';

const project=Deno.env.get('SUPABASE_URL')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const serviceHeaders={apikey:service,Authorization:'Bearer '+service};
const origins=new Set(['https://ysg.lawinus.org']);
const edition='ysg-20261121';
const prefix='ysg-20261121';
const bucket='ysg-reader-media';
const hex=(bytes:Uint8Array)=>Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
async function hash(value:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));}
async function rpc(name:string,payload:Record<string,unknown>){
 const r=await fetch(project+'/rest/v1/rpc/'+name,{method:'POST',headers:{...serviceHeaders,'Content-Type':'application/json'},body:JSON.stringify(payload)});
 if(!r.ok)throw new Error('service unavailable');return r.json();
}
Deno.serve(async req=>{
 const origin=req.headers.get('Origin')||'';
 const headers:Record<string,string>={'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://ysg.lawinus.org','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Access-Control-Allow-Headers':'authorization,content-type','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
 const response=(status:number,body:unknown)=>new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{...headers,'Content-Type':typeof body==='string'?'text/plain; charset=utf-8':'application/json; charset=utf-8'}});
 try{
 if(!origins.has(origin))return response(403,'요청 출처를 확인해 주세요.');
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()||'shared';
 const clientDigest=await hash(service+'|ysg-ip|'+ip);
 if(mode==='visit'){
  if(req.method!=='POST')return response(405,'');
  const raw=await req.text();if(raw.length>1024)return response(413,'');
  const input=JSON.parse(raw);if(typeof input.browserKey!=='string'||!/^[0-9a-f]{64}$/.test(input.browserKey))return response(400,'');
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  const result=await rpc('ysg_reader_visit',{owner_digest:await hash('ysg-owner|'+input.browserKey),session_digest:await hash(token),client_digest:clientDigest});
  if(result.limited)return new Response('잠시 뒤 다시 열어 주세요.',{status:429,headers:{...headers,'Retry-After':'60'}});
  return response(200,{token,expiresAt:result.expiresAt});
 }
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
 if(!/^[0-9a-f]{64}$/.test(token))return response(401,'열람 연결을 새로 시작해 주세요.');
 const digest=await hash(token);
 const gate=await rpc('ysg_reader_authorize',{session_digest:digest,client_digest:clientDigest});
 if(gate==='limited')return new Response('잠시 뒤 다시 열어 주세요.',{status:429,headers:{...headers,'Retry-After':'60'}});
 if(gate!=='allow')return response(401,'열람 연결을 새로 시작해 주세요.');
 const params=new URL(req.url).searchParams;
 if(params.get('edition')!==edition)return response(404,'판본을 찾을 수 없습니다.');
 if(mode==='notes'){
  if(!['GET','PUT'].includes(req.method))return response(405,'');
  let page=null,body=null;
  if(req.method==='PUT'){
   const raw=await req.text();if(raw.length>60000)return response(413,'');
   const input=JSON.parse(raw);page=input.page;body=input.body;
   if(!Number.isInteger(page)||page<1||page>209||typeof body!=='string'||body.length>12000)return response(400,'메모 내용을 확인해 주세요.');
  }
  return response(200,await rpc('ysg_reader_notes',{session_digest:digest,edition_input:edition,page_input:page,body_input:body}));
 }
 if(req.method!=='GET')return response(405,'');
 const meta=params.get('metadata'),p=params.get('page')||'',src=params.get('source'),caseKey=params.get('case'),lawKey=params.get('law');
 let path='',type='';
 if(meta==='search'){
 const q=(params.get('q')||'').trim().slice(0,120);if(q.length<2)return response(200,{results:[]});
 const object=await fetch(project+'/storage/v1/object/authenticated/'+bucket+'/'+prefix+'/metadata/search.json',{headers:serviceHeaders});if(!object.ok)return response(503,'검색 자료를 열 수 없습니다.');
 const rows=await object.json();const needle=q.toLocaleLowerCase().replace(/\s+/g,'');
 return response(200,{results:rows.filter((v:{text:string})=>v.text.toLocaleLowerCase().replace(/\s+/g,'').includes(needle)).slice(0,80).map((v:{page:number;text:string})=>({page:v.page,text:v.text}))});
 }
 if(['catalog','citations','review-manifest','review-profile'].includes(meta||'')){path=prefix+'/metadata/'+meta+'.json';type='application/json';}
 else if(meta==='page'&&/^[1-9][0-9]{0,2}$/.test(p)&&Number(p)<=209){path=prefix+'/metadata/pages/'+p+'.json';type='application/json';}
 else if(meta==='reference'&&src&&/^[A-Za-z0-9_-]{1,80}$/.test(src)){path=prefix+'/references/manifests/'+src+'.json';type='application/json';}
 else if(meta==='case'&&caseKey&&/^[A-Za-z0-9가-힣_.-]{1,100}$/.test(caseKey)){path=prefix+'/cases/case-'+hex(new TextEncoder().encode(caseKey))+'.json';type='application/json';}
 else if(meta==='law'&&lawKey&&/^[A-Za-z0-9_-]{1,100}$/.test(lawKey)){path=prefix+'/laws/'+lawKey+'.json';type='application/json';}
 else if(meta===null&&src&&/^[A-Za-z0-9_-]{1,80}$/.test(src)&&/^[1-9][0-9]{0,3}$/.test(p)){path=prefix+'/references/pages/'+src+'/'+p+'.webp';type='image/webp';}
 else if(meta===null&&src===null&&/^[1-9][0-9]{0,2}$/.test(p)&&Number(p)<=209){path=prefix+'/pages/'+p+'.webp';type='image/webp';}
 else return response(404,'자료를 찾을 수 없습니다.');
 const object=await fetch(project+'/storage/v1/object/authenticated/'+bucket+'/'+path,{headers:serviceHeaders});
 if(!object.ok)return response(object.status===400||object.status===404?404:503,'자료를 열 수 없습니다.');
 return new Response(object.body,{headers:{...headers,'Content-Type':type,'Content-Disposition':'inline'}});
 }catch{return response(503,'요청을 처리하지 못했습니다. 다시 시도해 주세요.');}
});


