(() => {
  'use strict';
  const dictionaryURL = new URL('/tools/glossary/index.html?v=ysg-20261121-005', location.origin).href;
  const explicit = new URLSearchParams(location.search);
  if (explicit.get('view') === 'glossary' && explicit.get('dictionary') === '1') {
    location.replace(dictionaryURL);
    return;
  }
  const edition = 'ysg-20261121';
  const pageCount = 209;
  const memoPrefix = 'ysg:sticky:' + edition + ':';
  const layoutKey = 'ysg:tools:layout:2';
  let currentPage = 1;
  let dictionaryWindow;
  let tools, box, active, trigger, body, memoInput, memoPage;
  const pageFrom = v => Number.isInteger(Number(v)) && Number(v)>0 && Number(v)<=pageCount ? Number(v) : null;
  function read(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
  function write(key, value) { try { const store=localStorage; if (value === null)store.removeItem(key);else store.setItem(key,value); return true; } catch { return false; } }
  function folio(page,compact=false) {
    const sheet=document.querySelector('.paper-page[data-page="'+page+'"]');
    return (compact?sheet?.dataset.folio:sheet?.dataset.folioDescription)||(compact?String(page):page+'쪽');
  }
  function gotoPage(page) { window.dispatchEvent(new CustomEvent('paper:navigate', {detail:{page}})); }
  function el(tag, text, cls) { const node=document.createElement(tag); if(text!==undefined) node.textContent=text; if(cls)node.className=cls; return node; }
  function button(text, action, label) { const b=el('button',text);b.type='button';if(label)b.setAttribute('aria-label',label);b.addEventListener('click',action);return b; }
  function openDictionary() {
    try {
      if(dictionaryWindow && !dictionaryWindow.closed) {dictionaryWindow.focus();return true;}
      dictionaryWindow=window.open(dictionaryURL,'lawinus-glossary',window.innerWidth>=700?'popup,width=940,height=840,resizable=yes,scrollbars=yes':undefined);
      if(!dictionaryWindow)return false;
      dictionaryWindow.opener=null;dictionaryWindow.focus();return true;
    } catch { return false; }
  }
  const notesEndpoint='https://cefaekvclooytgjkcqum.supabase.co/functions/v1/ysg-notes?edition=ysg-20261121';
  const cacheKey=memoPrefix+'drafts';
  let noteSession=null;
  function getToken(){if(window.__paperReaderSession?.token)return window.__paperReaderSession.token;try{return JSON.parse(sessionStorage.getItem('ysg-reader-session')||'null')?.token||'';}catch{return '';}}
  function memoNumbers(){return [...(noteSession?.values.keys()||[])].filter(n=>noteSession.values.get(n)?.trim()).sort((a,b)=>a-b);}
  function memoValue(n){return noteSession?.values.get(n)||'';}
  function storeDrafts(state){
    if(state!==noteSession)return;
    try{
      if(state.pending.size)sessionStorage.setItem(cacheKey,JSON.stringify({owner:state.token.slice(0,20),pages:Object.fromEntries(state.pending)}));
      else sessionStorage.removeItem(cacheKey);
    }catch{}
  }
  function redrawMemoState(){
    if(active==='notes'){
      const status=body.querySelector('[data-status]');
      const retry=body.querySelector('[data-retry]');
      if(status)status.textContent=noteSession?.error||(!noteSession||noteSession.loading?'포스트잇을 불러오는 중…':noteSession.pending.size?'저장 중…':'이 브라우저의 포스트잇에 저장됨');
      if(retry)retry.hidden=!noteSession?.error;
    }
  }
  function refreshVisibleNotes(){
    if(active==='notes'&&document.activeElement!==memoInput)renderNotes(memoPage);
    else if(active==='notes')body.querySelector('.prt-saved')?.dispatchEvent(new Event('refresh'));
    redrawMemoState();markPages();
  }
  async function loadRemote(state){
    state.loading=true;state.error='';const version=state.edits;
    try{
      const res=await fetch(notesEndpoint,{headers:{Authorization:'Bearer '+state.token},credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:state.controller.signal});
      if(!res.ok)throw Error();
      const payload=await res.json();
      if(!Array.isArray(payload.notes))throw Error();
      if(state!==noteSession)return;
      for(const item of payload.notes){
        const n=pageFrom(item.page);
        if(n&&typeof item.body==='string'&&!state.pending.has(n)&&(state.touch.get(n)||0)<=version)state.values.set(n,item.body);
      }
      state.loaded=true;
    }catch{if(state===noteSession)state.error='포스트잇을 불러오지 못했습니다.';}
    finally{if(state===noteSession){state.loading=false;refreshVisibleNotes();}}
  }
  function syncLogin(){
    const token=getToken();if(!token||token===noteSession?.token)return;
    clearSessionMemos(false);
    const state={token,values:new Map(),pending:new Map(),touch:new Map(),edits:0,error:'',loaded:false,loading:true,timer:0,worker:null,controller:new AbortController()};
    noteSession=state;
    try{
      const draft=JSON.parse(sessionStorage.getItem(cacheKey)||'null');
      if(draft?.owner===token.slice(0,20))for(const [key,value] of Object.entries(draft.pages||{})){
        const page=pageFrom(key);if(page&&typeof value==='string'){state.values.set(page,value);state.pending.set(page,value);}
      }
      storeDrafts(state);
    }catch{}
    loadRemote(state);
    if(state.pending.size)flushState(state);
  }
  function flushState(state){
    if(state.worker)return state.worker;
    clearTimeout(state.timer);
    state.worker=(async()=>{
      while(state===noteSession&&state.pending.size){
        const [page,body]=state.pending.entries().next().value;
        try{
          const res=await fetch(notesEndpoint,{method:'PUT',headers:{Authorization:'Bearer '+state.token,'Content-Type':'application/json'},body:JSON.stringify({page,body}),credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:state.controller.signal});
          if(!res.ok)throw Error();
          const saved=await res.json();
          if(!Array.isArray(saved.notes)||!saved.notes.some(note=>note.page===page&&note.body===body))throw Error();
          if(state!==noteSession)return false;
          if(state.pending.get(page)===body)state.pending.delete(page);
          state.error='';storeDrafts(state);
        }catch{if(state===noteSession)state.error='저장하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.';return false;}
      }
      return state===noteSession;
    })().finally(()=>{state.worker=null;if(state===noteSession)redrawMemoState();});
    return state.worker;
  }
  window.paperFlushNotes=async()=>{
    const state=noteSession;if(!state||!state.pending.size)return true;
    const ok=await flushState(state);
    if(!ok&&state===noteSession){
      if(active!=='notes')showBox('notes',tools.querySelector('[data-tool="notes"]'));
      const first=state.pending.keys().next().value;if(first)renderNotes(first);redrawMemoState();
    }
    return ok;
  };
  function updateMemo(page,text){
    const state=noteSession;if(!state)return;
    const value=text.trim()?text:'';
    state.values.set(page,value);state.pending.set(page,value);state.touch.set(page,++state.edits);
    state.error='';storeDrafts(state);clearTimeout(state.timer);state.timer=setTimeout(()=>flushState(state),550);redrawMemoState();
  }
  window.addEventListener('pagehide',()=>{if(noteSession?.pending.size)storeDrafts(noteSession);});
  function closeBox(restore=true) {
    if(!box)return;
    box.remove();box=null;active=null;memoInput=null;
    for(const b of tools.querySelectorAll('[aria-expanded]'))b.setAttribute('aria-expanded','false');
    if(restore&&trigger?.isConnected)trigger.focus();
  }
  function attachResize(node, kind, axes, apply, limits) {
    const grip=button('⤡',()=>{},'너비·높이 조절');
    grip.className='prt-grip';grip.title='드래그 또는 방향키로 크기 조절';
    grip.setAttribute('aria-label',kind+' 크기 조절');
    node.append(grip);
    let drag;
    const clamp=(v,lo,hi)=>Math.min(Math.max(lo,hi),Math.max(lo,v));
    function resize(w,h) {
      const [minW,maxW,minH,maxH]=limits();
      const next={width:clamp(w,minW,maxW),height:clamp(h,minH,maxH)};
      apply(next);
      write(layoutKey+':'+kind,JSON.stringify(next));
    }
    grip.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;
      const rect=node.getBoundingClientRect();
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,w:rect.width,h:rect.height};
      grip.setPointerCapture(e.pointerId);e.preventDefault();
    });
    grip.addEventListener('pointermove',e=>{
      if(!drag||e.pointerId!==drag.id)return;
      resize(drag.w+(axes.x||0)*(e.clientX-drag.x),drag.h+(axes.y||0)*(e.clientY-drag.y));
    });
    function finish(){drag=null;}
    for(const ev of ['pointerup','pointercancel','lostpointercapture'])grip.addEventListener(ev,finish);
    grip.addEventListener('keydown',e=>{
      const delta={ArrowRight:[16,0],ArrowLeft:[-16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];
      if(!delta)return;
      e.preventDefault(); const rect=node.getBoundingClientRect(); resize(rect.width+delta[0],rect.height+delta[1]);
    });
    // Grab the physical sides, including on a scrolled menu. Keep its corner for keyboard users.
    function bindBorder(owner,xAxis,yAxis){
      let held=null;
      const borderAt=e=>{
        const rect=owner.getBoundingClientRect(),slop=e.pointerType==='touch'?9:5;
        return {x:xAxis&&Math.abs(e.clientX-(xAxis<0?rect.left:rect.right))<=slop?xAxis:0,
          y:yAxis&&Math.abs(e.clientY-rect.bottom)<=slop?1:0};
      };
      owner.addEventListener('pointerdown',e=>{
        if(!e.isPrimary||e.button!==0||e.target===grip)return;
        const axis=borderAt(e);if(!axis.x&&!axis.y)return;
        const r=node.getBoundingClientRect();
        let height=r.height;
        if(owner!==node){
          const css=getComputedStyle(owner);
          height=owner.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom);
        }
        held={id:e.pointerId,startX:e.clientX,startY:e.clientY,w:r.width,h:height,...axis};
        owner.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();
      },true);
      owner.addEventListener('pointermove',e=>{
        if(held&&e.pointerId===held.id){
          e.preventDefault();
          resize(held.w+held.x*(e.clientX-held.startX),held.h+held.y*(e.clientY-held.startY));
        }
        const axis=held||borderAt(e);
        owner.style.cursor=axis.x?(axis.y?(axis.x>0?'nwse-resize':'nesw-resize'):'col-resize'):axis.y?'row-resize':'';
      });
      const release=e=>{if(held?.id===e.pointerId){held=null;owner.style.cursor='';}};
      for(const type of ['pointerup','pointercancel','lostpointercapture'])owner.addEventListener(type,release);
    }
    const header=node.closest('.examiner-header');
    bindBorder(node,axes.x,header?0:axes.y);
    if(header)bindBorder(header,0,axes.y);
    try {const saved=JSON.parse(read(layoutKey+':'+kind,'null')); if(saved && Number.isFinite(saved.width)&&Number.isFinite(saved.height)) resize(saved.width,saved.height);}catch{}
  }
  function showBox(kind, anchor) {
    if(active===kind){closeBox();return;}
    closeBox(false);active=kind;trigger=anchor;anchor.setAttribute('aria-expanded','true');
    box=el('section',undefined,'prt-box prt-'+kind);box.setAttribute('role','dialog');
    const heading=kind==='notes'?'포스트잇':'전체보기';box.setAttribute('aria-label',heading);
    const head=el('header');head.append(el('h2',heading),button('닫기',()=>closeBox()));box.append(head);
    body=el('div',undefined,'prt-body');box.append(body);document.body.append(box);
    attachResize(box,heading,{x:-1,y:1},s=>{box.style.width=s.width+'px';box.style.height=s.height+'px';},()=>[Math.min(245,innerWidth-20),innerWidth-20,175,innerHeight-20]);
    if(kind==='notes')renderNotes(currentPage);else renderOverview();
    head.lastChild.focus();
  }
  function renderNotes(page) {
    memoPage=page;body.replaceChildren();
    const heading=el('label','제출본 '+folio(page));heading.htmlFor='prt-memo';
    memoInput=el('textarea');memoInput.id='prt-memo';memoInput.rows=5;memoInput.maxLength=6000;memoInput.disabled=!noteSession?.loaded;memoInput.value=memoValue(page);memoInput.placeholder='이 쪽에 남길 메모';
    const status=el('small');status.dataset.status='';status.setAttribute('role','status');
    const retry=button('다시 시도',async()=>{const state=noteSession;if(!state)return;if(!state.loaded&&!state.loading)await loadRemote(state);if(state.pending.size)await flushState(state);});retry.dataset.retry='';
    const counter=el('small');counter.textContent=memoInput.value.length.toLocaleString('ko-KR')+' / 6,000자';const rows=el('div',undefined,'prt-actions');const updated=()=>drawTabs();
    memoInput.addEventListener('input',()=>{
      counter.textContent=memoInput.value.length.toLocaleString('ko-KR')+' / 6,000자';updateMemo(page,memoInput.value);
      updated();
    });
    rows.append(status,counter,retry);
    const list=el('div',undefined,'prt-saved');list.setAttribute('aria-label','메모가 있는 쪽');
    function drawTabs(){
      const pages=memoNumbers(); list.replaceChildren();
      if(pages.length)list.append(el('h3','메모가 있는 쪽'));
      for(const n of pages){
        const b=button(folio(n),()=>{renderNotes(n);gotoPage(n);});
        b.setAttribute('aria-current',n===page?'page':'false');b.title=memoValue(n).slice(0,100);list.append(b);
      }
      markPages();
    }
    list.addEventListener('refresh',drawTabs);body.append(heading,memoInput,rows,list);drawTabs();redrawMemoState();
  }
  function markPages() {
    const withMemos=new Set(memoNumbers());
    for(const page of document.querySelectorAll('.paper-page[data-page]')){
      const n=pageFrom(page.dataset.page); const old=page.querySelector(':scope > .prt-note-marker');
      if(!n||!withMemos.has(n)){old?.remove();continue;}
      if(old)continue;
      const b=button('메모',()=>{if(active!=='notes')showBox('notes',tools.querySelector('[data-tool="notes"]'));renderNotes(n);},folio(n)+' 포스트잇 열기');
      b.className='prt-note-marker';page.append(b);
    }
  }
  function renderOverview() {
    body.replaceChildren();
    const actions=el('div',undefined,'prt-actions');
    const fullscreen=button(document.fullscreenElement?'전체 화면 종료':'전체 화면',async()=>{
      try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen(); closeBox();}
      catch {fullscreen.textContent='이 환경에서는 전체 화면을 사용할 수 없습니다.';}
    });
    actions.append(el('span','논문 인쇄 쪽'),fullscreen);
    const grid=el('div',undefined,'prt-grid');
    for(let n=1;n<=pageCount;n++){
      const b=button(folio(n,true),()=>{closeBox(false);gotoPage(n);},'제출본 '+folio(n)+' 이동');
      if(n===currentPage)b.setAttribute('aria-current','page');
      grid.append(b);
    }
    body.append(actions,grid);requestAnimationFrame(()=>grid.querySelector('[aria-current="page"]')?.scrollIntoView({block:'nearest'}));
  }
  function mountTools(header) {
    const slot=header.querySelector('.reader-tools-slot')||header.querySelector('nav')||header;
    tools=el('div',undefined,'prt-tool-row');tools.setAttribute('aria-label','논문 열람 도구');
    const lookup=el('a','어학사전');lookup.href=dictionaryURL;lookup.target='lawinus-glossary';lookup.rel='noopener noreferrer';
    lookup.addEventListener('click',e=>{if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey&&openDictionary())e.preventDefault();});
    tools.append(lookup);
    for(const [kind,title] of [['overview','전체보기'],['notes','포스트잇']]){
      const b=button(title,()=>showBox(kind,b));b.dataset.tool=kind;b.setAttribute('aria-expanded','false');tools.append(b);
    }
    slot.append(tools);
  }
  let wasAdmitted=false;
  function clearSessionMemos(dropCache=true){
    if(noteSession){clearTimeout(noteSession.timer);noteSession.controller.abort();noteSession=null;}
    if(dropCache)try{sessionStorage.removeItem(cacheKey);}catch{}
  }
  function autoDictionary(){
    try{
      const ordinary=!location.hash&&[...explicit.keys()].every(k=>k==='v');
      if(ordinary&&window.top===window.self&&!sessionStorage.getItem('paper:glossary-attempt')&&Number(read('lawinus.glossary-autostart.pause-until.v1','0'))<=Date.now()){
        sessionStorage.setItem('paper:glossary-attempt','1');openDictionary();
      }
    }catch{}
  }
  function mountDivider(layout){
    if(!layout||layout.querySelector(':scope > .prt-divider'))return;
    const rail=el('div',undefined,'prt-divider');rail.tabIndex=0;rail.setAttribute('role','separator');
    rail.setAttribute('aria-label','논문과 참고문헌 너비 조절');rail.setAttribute('aria-orientation','vertical');
    rail.setAttribute('aria-valuemin','30');rail.setAttribute('aria-valuemax','70');layout.append(rail);
    const narrow=matchMedia('(max-width:760px)');
    const key=()=>layoutKey+(narrow.matches?':stacked-split':':split');
    const setSplit=(fraction,save=true)=>{
      const v=Math.max(30,Math.min(70,fraction));
      layout.style.setProperty(narrow.matches?'--prt-stacked-split':'--paper-width',v+'%');
      rail.setAttribute('aria-valuenow',String(Math.round(v)));if(save)write(key(),String(v));
    };
    function orient(){
      const vertical=!narrow.matches;
      rail.setAttribute('aria-orientation',vertical?'vertical':'horizontal');
      rail.setAttribute('aria-label',vertical?'논문과 참고문헌 너비 조절':'논문과 참고문헌 사이 높이 조절');
      const value=Number(read(key(),vertical?'53':'50'));
      setSplit(Number.isFinite(value)?value:50,false);
    }
    narrow.addEventListener('change',orient);orient();
    let dragging=null;
    rail.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();dragging=e.pointerId;rail.setPointerCapture(e.pointerId);rail.focus();});
    rail.addEventListener('pointermove',e=>{
      if(e.pointerId!==dragging)return;
      const r=layout.getBoundingClientRect();
      if(narrow.matches&&r.height)setSplit(100*(e.clientY-r.top)/r.height);
      else if(r.width)setSplit(100*(e.clientX-r.left)/r.width);
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])rail.addEventListener(event,()=>{dragging=null;});
    rail.addEventListener('dblclick',()=>setSplit(50));
    rail.addEventListener('keydown',e=>{
      const v=Number(rail.getAttribute('aria-valuenow'));
      const move=narrow.matches?{Home:30,End:70,ArrowUp:v-2,ArrowDown:v+2}:{Home:30,End:70,ArrowLeft:v-2,ArrowRight:v+2};
      if(e.key in move){e.preventDefault();setSplit(move[e.key]);}
    });
  }
  // The shared reading surface grows independently of its two scrollable documents.
  function mountReadingHeight(layout) {
    if (!layout || layout.nextElementSibling?.classList.contains('prt-reading-edge')) return;
    const key = layoutKey + ':reading-height';
    const stored = Number(read(key, '0'));
    let manuallySized = Number.isFinite(stored) && stored > 0;
    let drag = null;
    const app = layout.closest('.examiner-app');
    const menus=app.querySelector('.reading-menus');
    const menuContent=menus?.querySelector('.reading-menus-content');
    const menuKey=layoutKey+':menu-fraction';
    const savedFraction=Number(read(menuKey,'1'));
    let menuFraction=Number.isFinite(savedFraction)?Math.max(0,Math.min(1,savedFraction)):1;
    let compactHeight=null;
    const scrollport=layout.querySelector('.paper-scroll');
    const initialPage=pageFrom(app.querySelector('.page-controls')?.dataset.currentSheet)||pageFrom(app.querySelector('[aria-label="논문 쪽"]')?.value);
    const anchor=initialPage&&scrollport?.querySelector('[data-page="'+initialPage+'"]');
    const offset=anchor?Math.max(0,Math.min(anchor.offsetHeight-1,scrollport.scrollTop-anchor.offsetTop)):0;
    const controller = new AbortController();
    const events = {signal:controller.signal};
    const footer = el('footer', undefined, 'prt-reading-footer');
    const fit = button('화면 높이에 맞춤', fitToWindow);
    footer.append(fit);
    const edge = el('div',undefined,'prt-reading-edge');
    const rail = el('div',undefined,'prt-reading-height');
    rail.tabIndex=0;
    rail.setAttribute('role','separator');
    rail.setAttribute('aria-label','논문과 참고문헌 높이 조절');
    rail.setAttribute('aria-orientation','horizontal');
    rail.title = '위아래로 끌거나 방향키를 누르세요. 두 번 누르거나 End 키로 화면에 맞춥니다.';
    rail.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown Home End');
    edge.append(rail);
    layout.after(edge,footer);

    const topEdge=el('div',undefined,'prt-menu-edge');
    const topRail=el('div',undefined,'prt-menu-height');
    const toggle=button('메뉴 접기',()=>changeMenu(menuFraction>0?0:1,true));
    toggle.className='prt-menu-toggle';
    toggle.setAttribute('aria-controls','reading-menus');
    if(menus && menuContent){
      topRail.tabIndex=0;
      topRail.setAttribute('role','separator');
      topRail.setAttribute('aria-orientation','horizontal');
      topRail.setAttribute('aria-label','상단 메뉴와 열람창 사이 높이 조절');
      topRail.setAttribute('aria-controls','reading-menus');
      topRail.setAttribute('aria-valuemin','0');
      topRail.setAttribute('aria-valuemax','100');
      topRail.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown Home End');
      topRail.title='경계를 위로 끌어 메뉴를 접거나 아래로 끌어 펼칩니다.';
      topEdge.append(topRail);
      layout.before(topEdge);
      const menuTools=layout.querySelector('.paper-menu-tools');
      if(menuTools)menuTools.prepend(toggle);
      else layout.querySelector('.paper-actions strong')?.after(toggle);
    }

    function menuHeight(){return menuContent?.offsetHeight||0;}
    function updateMenu(){
      if(!menus)return;
      const collapsed=menuFraction===0;
      menus.style.maxHeight=menuFraction===1?'none':Math.round(menuHeight()*menuFraction)+'px';
      if(menus.inert!==collapsed){
        menus.inert=collapsed;
        window.dispatchEvent(new Event('paper:menu-visibility'));
      }
      topEdge.classList.toggle('at-top',collapsed);
      app.classList.toggle('prt-menus-collapsed',collapsed);
      topRail.setAttribute('aria-valuenow',String(Math.round(menuFraction*100)));
      topRail.setAttribute('aria-valuetext',collapsed?'접힘':menuFraction===1?'펼침':Math.round(menuFraction*100)+'%');
      const label=collapsed?'메뉴 열기':'메뉴 접기';
      if(toggle.textContent!==label)toggle.textContent=label;
      toggle.setAttribute('aria-label','상단 '+label);
      toggle.setAttribute('aria-expanded',String(!collapsed));
      toggle.title=collapsed?'상단 메뉴 다시 표시':'상단 메뉴를 접고 논문과 참고문헌을 화면에 채우기';
    }
    function changeMenu(fraction,save){
      if(fraction===0 && menuFraction!==0)compactHeight=null;
      menuFraction=Math.max(0,Math.min(1,fraction));
      if(save)write(menuKey,String(menuFraction));
      refreshSize();
    }
    let menuDrag=null;
    topRail.addEventListener('pointerdown',event=>{
      if(event.button!==0||menuDrag)return;
      event.preventDefault();
      topRail.focus({preventScroll:true});
      topRail.setPointerCapture(event.pointerId);
      menuDrag={id:event.pointerId,y:event.clientY,height:menus.offsetHeight};
      topRail.classList.add('is-dragging');
    });
    topRail.addEventListener('pointermove',event=>{
      if(menuDrag?.id!==event.pointerId)return;
      const full=menuHeight();
      if(!full)return;
      const height=menuDrag.height+event.clientY-menuDrag.y;
      changeMenu(height<=6?0:height>=full-6?1:height/full,false);
    });
    function endMenuDrag(event){
      if(menuDrag?.id!==event.pointerId)return;
      menuDrag=null;
      topRail.classList.remove('is-dragging');
      write(menuKey,String(menuFraction));
    }
    for(const type of ['pointerup','pointercancel','lostpointercapture'])topRail.addEventListener(type,endMenuDrag);
    topRail.addEventListener('dblclick',()=>changeMenu(menuFraction>0?0:1,true));
    topRail.addEventListener('keydown',event=>{
      const step=(event.shiftKey?64:20)/Math.max(1,menuHeight());
      const values={ArrowUp:menuFraction-step,ArrowDown:menuFraction+step,Home:0,End:1};
      if(event.key in values){event.preventDefault();changeMenu(Math.max(0,Math.min(1,values[event.key])),true);}
    });
    menus?.addEventListener('focusin',event=>{
      if(menuFraction>0 && menuFraction<1 && event.target.getBoundingClientRect().bottom>menus.getBoundingClientRect().bottom)changeMenu(1,true);
    },events);

    function availableHeight() {
      const top = layout.getBoundingClientRect().top + window.scrollY;
      return Math.max(1, innerHeight - top);
    }
    function minHeight() {return Math.min(innerWidth<=760?396:214,availableHeight());}
    function defaultHeight() {
      return Math.max(minHeight(),availableHeight()-footer.offsetHeight);
    }
    function setHeight(value) {
      const px = Math.min(availableHeight(),Math.max(minHeight(), Math.round(value)));
      layout.style.setProperty('--prt-reading-height', px+'px');
      rail.setAttribute('aria-valuemin',String(minHeight()));
      rail.setAttribute('aria-valuemax',String(availableHeight()));
      rail.setAttribute('aria-valuenow',String(px));
      rail.setAttribute('aria-valuetext',px+'픽셀');
      edge.classList.toggle('at-window-end',px>=availableHeight()-1);
      footer.inert=px>defaultHeight()+2;
      return px;
    }
    function fitToWindow() {
      if(menuFraction===0){compactHeight=null;setHeight(availableHeight());return;}
      manuallySized = false;
      write(key, null);
      setHeight(defaultHeight());
    }
    function persist(value) {
      if(menuFraction===0){compactHeight=value;return;}
      manuallySized=true;
      write(key,String(Math.max(1,value-menuHeight()*(1-menuFraction))));
    }
    function stopDrag() {
      if(!drag)return;
      persist(drag.height);
      drag=null;
      rail.classList.remove('is-dragging');
    }
    rail.addEventListener('pointerdown', event => {
      if(event.button!==0 || drag)return;
      event.preventDefault();
      rail.focus({preventScroll:true});
      rail.setPointerCapture(event.pointerId);
      const height=layout.getBoundingClientRect().height;
      drag={id:event.pointerId,y:event.clientY,start:height,height};
      rail.classList.add('is-dragging');
    });
    rail.addEventListener('pointermove', event => {
      if(!drag || event.pointerId!==drag.id)return;
      const delta=event.clientY-drag.y;
      drag.height=setHeight(drag.start+delta);
    });
    for(const type of ['pointerup','pointercancel','lostpointercapture'])rail.addEventListener(type,stopDrag);
    rail.addEventListener('dblclick',fitToWindow);
    rail.addEventListener('keydown',event=>{
      if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
      event.preventDefault();
      if(event.key==='End'){fitToWindow();return;}
      const step=event.shiftKey?80:24;
      const next=event.key==='Home'?minHeight():layout.getBoundingClientRect().height+(event.key==='ArrowDown'?step:-step);
      persist(setHeight(next));
    });
    function refreshSize(){
      if(!layout.isConnected){controller.abort();observer.disconnect();stopDrag();footer.remove();edge.remove();topEdge.remove();return;}
      updateMenu();
      if(drag)return;
      if(menuFraction===0){setHeight(compactHeight??availableHeight());return;}
      const savedHeight=Number(read(key,'0'));
      setHeight(manuallySized && savedHeight?savedHeight+menuHeight()*(1-menuFraction):defaultHeight());
    }
    const observer=new ResizeObserver(refreshSize);
    for(const node of [menuContent||app.querySelector('.examiner-header'),app.querySelector('.page-controls'),footer])if(node)observer.observe(node);
    window.addEventListener('resize',refreshSize,events);
    // Size the row before releasing the viewport-height flex layout, so the
    // browser cannot briefly expand the scrollport to every manuscript page.
    refreshSize();
    app.classList.add('prt-resizable-reading');
    if(anchor&&scrollport)scrollport.scrollTop=anchor.offsetTop+offset;
  }
  const handBindings=new WeakMap();
  function bindHandScroll(port) {
    if(handBindings.has(port))return handBindings.get(port);
    let gesture=null;
    let suppressClick=false;
    const endGesture=()=>{
      if(!gesture)return;
      suppressClick=gesture.dragged;
      gesture.listeners.abort();
      if(port.hasPointerCapture?.(gesture.id))port.releasePointerCapture(gesture.id);
      gesture=null;
      port.classList.remove('prt-hand-dragging');
    };
    port.addEventListener('pointerdown',e=>{
      if(!port.classList.contains('prt-hand-enabled') || !e.isPrimary || e.button!==0)return;
      if(e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
      endGesture();suppressClick=false;
      const listeners=new AbortController();
      gesture={id:e.pointerId,x:e.clientX,y:e.clientY,left:port.scrollLeft,top:port.scrollTop,dragged:false,listeners};
      const options={capture:true,passive:false,signal:listeners.signal};
      const move=event=>{
        const g=gesture;
        if(!g || event.pointerId!==g.id)return;
        const dx=event.clientX-g.x,dy=event.clientY-g.y;
        if(!g.dragged&&Math.hypot(dx,dy)<6)return;
        if(!g.dragged){
          g.dragged=true;port.setPointerCapture(g.id);port.classList.add('prt-hand-dragging');
        }
        event.preventDefault();
        port.scrollLeft=g.left-dx;port.scrollTop=g.top-dy;
      };
      window.addEventListener('pointermove',move,options);
      const finish=event=>{if(gesture&&event.pointerId===gesture.id)endGesture();};
      for(const name of ['pointerup','pointercancel'])window.addEventListener(name,finish,options);
      window.addEventListener('blur',endGesture,{once:true,signal:listeners.signal});
    });
    port.addEventListener('lostpointercapture',endGesture);
    // A drag beginning on a citation pans the page. An ordinary click still follows it.
    port.addEventListener('click',e=>{
      if(suppressClick && e.detail>0){e.preventDefault();e.stopImmediatePropagation();suppressClick=false;}
    },true);
    const binding={set(enabled){if(!enabled)endGesture();port.classList.toggle('prt-hand-enabled',enabled);}};
    handBindings.set(port,binding);return binding;
  }
  function mountHandTool(pane,barSelector,portSelector,label){
    if(!pane)return;
    const bar=pane.querySelector(barSelector),port=pane.querySelector(portSelector);
    if(!bar)return;
    let tool=bar.querySelector('.prt-hand-toggle');
    if(!port){if(tool)tool.hidden=true;return;}
    if(!tool){
      tool=button('손 도구',()=>{
        const current=pane.querySelector(portSelector);
        if(!current)return;
        const enabled=tool.getAttribute('aria-pressed')!=='true';
        tool.setAttribute('aria-pressed',String(enabled));
        bindHandScroll(current).set(enabled);
      },label+' 손 도구');
      tool.className='prt-hand-toggle';
      tool.setAttribute('aria-pressed','false');
      tool.title='켜면 문서를 잡아 끌어 이동하고, 끄면 기본 선택 모드로 돌아갑니다.';
      bar.append(tool);
    }
    tool.hidden=false;
    bindHandScroll(port).set(tool.getAttribute('aria-pressed')==='true');
  }
  function sync() {
    const header=document.querySelector('.examiner-header');
    const admitted=Boolean(header&&document.querySelector('.manuscript-pane')&&!document.querySelector('.gate'));
    if(!admitted){
      if(wasAdmitted){closeBox(false);clearSessionMemos();tools?.remove();wasAdmitted=false;}
      return;
    }
    syncLogin();if(!wasAdmitted){wasAdmitted=true;autoDictionary();}
    if(!document.querySelector('.prt-tool-row'))mountTools(header);
    const nav=header.querySelector('nav');
    if(nav&&!nav.querySelector(':scope>.prt-grip')){
      attachResize(nav,'상단 메뉴',{x:-1,y:1},({width,height})=>{
        nav.style.setProperty('--prt-nav-width',width+'px');nav.style.setProperty('--prt-nav-height',height+'px');
      },()=>[Math.min(160,innerWidth-28),Math.max(200,innerWidth-28),40,Math.max(100,innerHeight*.4)]);
    }
    const readingLayout=document.querySelector('.reader-layout');
    mountDivider(readingLayout);
    mountReadingHeight(readingLayout);
    mountHandTool(document.querySelector('.manuscript-pane'),'.paper-actions','.paper-scroll','논문');
    mountHandTool(document.querySelector('.reference-pane'),'.reference-toolbar','.source-dialog','원전');

    const toc=document.querySelector('.toc-pane');
    if(toc&&!toc.querySelector(':scope > .prt-grip')){
      attachResize(toc,'목차 메뉴',{x:1,y:1},({width,height})=>{
        const layout=toc.closest('.reader-layout'); layout?.style.setProperty('--toc-width',width+'px');
        toc.style.setProperty('--prt-toc-width',width+'px');toc.style.setProperty('--prt-toc-height',height+'px');
      },()=>[Math.min(150,innerWidth-20),Math.min(640,innerWidth-20),125,Math.max(125,innerHeight-(header?.getBoundingClientRect().height||0)-12)]);
    }
    markPages();
  }
  let queued=false;
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;sync();});}
  window.addEventListener('paper:page',e=>{const n=pageFrom(e.detail?.page);if(!n)return;currentPage=n;if(active==='notes'&&memoPage!==n)renderNotes(n);});

  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&box){closeBox();e.preventDefault();}});
  const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});schedule();
})();
