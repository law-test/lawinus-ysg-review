(() => {
  'use strict';
  const asset = name => new URL('ocr/' + name, document.baseURI).href;
  let library, armed, drag, frame, dialog, worker, run = 0;
  const buttons = new Map();
  function node(tag, txt, cls) { const el=document.createElement(tag); if(txt!==undefined)el.textContent=txt;if(cls)el.className=cls;return el; }
  function newButton(label, fn) { const b=node('button',label);b.type='button';b.addEventListener('click',fn);return b; }
  function script() {
    if(library)return library;
    library=new Promise((resolve,reject)=>{
      const tag=document.createElement('script');tag.integrity='sha384-r1ru3tcf6FhnCFR4B7pIFG+BhFF9LlFtz/P1y4pblWn3AGs9y3lBx5SKLNf4+rED';tag.src=asset('tesseract.min.js');
      tag.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(Error('library'));
      tag.onerror=()=>reject(Error('library'));document.head.append(tag);
    }).catch(e=>{library=null;throw e;});
    return library;
  }
  function setArmed(pane){
    armed=pane;
    document.querySelectorAll('.ocr-instruction').forEach(n=>n.remove());
    for(const [p,b] of buttons){b.setAttribute('aria-pressed',String(p===pane));p.classList.toggle('ocr-armed',p===pane);}
    if(!pane)return;
    const hint=node('span','인식할 한두 줄을 드래그하세요.','ocr-instruction');hint.setAttribute('role','status');buttons.get(pane).insertAdjacentElement('afterend',hint);
  }
  function close(){
    run++;
    if(worker){worker.terminate().catch(()=>{});worker=null;}
    if(dialog){dialog.close();dialog.remove();dialog=null;}
    setArmed(null);
  }
  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
  function imageFrame(img){
    const b=img.getBoundingClientRect(),scale=Math.min(b.width/img.naturalWidth,b.height/img.naturalHeight);
    const width=img.naturalWidth*scale,height=img.naturalHeight*scale;
    return {x:b.x+(b.width-width)/2,y:b.y+(b.height-height)/2,width,height};
  }
  function bounds(d,x,y){
    const {image,rect,startX,startY}=d;
    const endX=clamp(x,rect.x,rect.x+rect.width),endY=clamp(y,rect.y,rect.y+rect.height);
    const w=Math.abs(endX-startX),h=Math.abs(endY-startY);
    return {left:Math.min(endX,startX),top:Math.min(endY,startY),width:w,height:h,
      valid:w>=8&&h>=6&&w<=rect.width*.92&&h<=rect.height*.075&&w*h<=rect.width*rect.height*.055&&image.complete};
  }
  function showFrame(r){
    Object.assign(frame.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
    frame.classList.toggle('ocr-too-large',!r.valid);
  }
  function acquire(e){
    if(!armed||drag||e.button!==0||!armed.contains(e.target))return;
    const sheet=e.target.closest('.paper-page,.source-image'),image=sheet?.querySelector('img');
    if(!image?.complete||!image.naturalWidth)return;
    const rect=imageFrame(image);
    if(e.clientX<rect.x||e.clientX>rect.x+rect.width||e.clientY<rect.y||e.clientY>rect.y+rect.height)return;
    e.preventDefault();e.stopImmediatePropagation();
    drag={id:e.pointerId,image,rect,startX:e.clientX,startY:e.clientY,owner:armed};
    frame=node('div',undefined,'ocr-frame');frame.ariaHidden='true';document.body.append(frame);showFrame(bounds(drag,e.clientX,e.clientY));
    armed.setPointerCapture(e.pointerId);
  }
  function move(e){
    if(!drag||drag.id!==e.pointerId)return;
    e.preventDefault();e.stopImmediatePropagation();showFrame(bounds(drag,e.clientX,e.clientY));
  }
  function finishDrag(){
    const d=drag;drag=null;
    if(d?.owner.hasPointerCapture(d.id))d.owner.releasePointerCapture(d.id);
    frame?.remove();frame=null;return d;
  }
  function end(e){
    if(!drag||drag.id!==e.pointerId)return;
    e.preventDefault();e.stopImmediatePropagation();const d=finishDrag();
    const r=bounds(d,e.clientX,e.clientY);
    if(!r.valid){const hint=d.owner.querySelector('.ocr-instruction');if(hint)hint.textContent='짧은 구절 한두 줄만 다시 선택하세요.';return;}
    let canvas;
    try{canvas=crop(d,r);}catch{
      const hint=d.owner.querySelector('.ocr-instruction');if(hint)hint.textContent='이 영역의 이미지를 읽을 수 없습니다. 다시 선택하세요.';return;
    }
    // Pointer capture releases before click. Keep OCR gestures from activating an underlying citation.
    const suppress=event=>{event.preventDefault();event.stopImmediatePropagation();};
    document.addEventListener('click',suppress,true);setTimeout(()=>document.removeEventListener('click',suppress,true),90);
    setArmed(null);recognize(canvas);
  }
  function crop(d,r){
    const sx=(r.left-d.rect.x)/d.rect.width*d.image.naturalWidth, sy=(r.top-d.rect.y)/d.rect.height*d.image.naturalHeight;
    const sw=r.width/d.rect.width*d.image.naturalWidth,sh=r.height/d.rect.height*d.image.naturalHeight;
    const scale=Math.min(3,1800/sw,300/sh);
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(sw*scale)+18;canvas.height=Math.ceil(sh*scale)+18;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('canvas');
    ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(d.image,sx,sy,sw,sh,9,9,sw*scale,sh*scale);
    return canvas;
  }
  function resultBox(){
    dialog=node('dialog',undefined,'ocr-dialog');dialog.setAttribute('aria-label','선택 영역 글자 인식');
    const header=node('header');header.append(node('h2','선택 영역 글자 인식'),newButton('닫기',close));
    const status=node('p','선택한 구절을 이 브라우저에서 인식합니다.');status.setAttribute('role','status');
    const label=node('label','인식한 글자');const text=node('textarea');text.rows=4;text.id='paper-ocr-result';label.htmlFor=text.id;text.disabled=true;
    const copy=newButton('복사',async()=>{
      if(!text.value.trim())return;
      try{await navigator.clipboard.writeText(text.value);status.textContent='선택한 글자를 복사했습니다.';}
      catch{text.focus();text.select();status.textContent='선택한 글자를 복사하려면 Ctrl+C 또는 기기의 복사 명령을 사용하세요.';}
    });
    copy.disabled=true;text.addEventListener('input',()=>{copy.disabled=!text.value.trim();});
    dialog.append(header,status,label,text,copy);document.body.append(dialog);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.showModal();
    return {status,text,copy};
  }
  async function recognize(canvas){
    close();const task=++run,{status,text,copy}=resultBox();let local;
    const deadline=setTimeout(()=>{
      if(task!==run)return;
      run++;
      if(worker){worker.terminate().catch(()=>{});worker=null;}
      canvas.width=0;canvas.height=0;status.textContent='인식 시간이 초과되었습니다. 창을 닫고 짧은 구절을 다시 선택하세요.';
    },65000);
    try{
      status.textContent='글자 인식기를 준비하고 있습니다…';
      const api=await script();if(task!==run)return;
      local=await api.createWorker('kor+eng',1,{workerPath:asset('worker-entry.js'),corePath:asset('tesseract-core-lstm.wasm.js'),langPath:new URL('ocr',document.baseURI).href,
        workerBlobURL:false,cacheMethod:'none',gzip:true,errorHandler:()=>{if(task===run)status.textContent='글자 인식기를 실행하지 못했습니다. 연결을 확인하고 다시 선택하세요.';},logger:m=>{if(task===run&&m.status==='recognizing text')status.textContent='선택한 구절 인식 중 · '+Math.round(m.progress*100)+'%';}});
      if(task!==run){await local.terminate();return;}worker=local;
      await local.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
      const result=await local.recognize(canvas);if(task!==run)return;
      text.disabled=false;text.value=String(result.data.text||'').trim();copy.disabled=!text.value.trim();
      status.textContent=text.value?'이미지에서 인식한 글자입니다. 원문을 대조하고 필요한 부분을 고쳐 복사하세요.':'글자를 식별하지 못했습니다. 구절을 다시 선택하세요.';
      text.focus();
    }catch{if(task===run)status.textContent='글자 인식기를 실행하지 못했습니다. 연결을 확인하고 다시 선택하세요.';}
    finally{clearTimeout(deadline);canvas.width=0;canvas.height=0;if(task===run&&local&&worker===local){worker=null;await local.terminate().catch(()=>{});}}
  }
  function sync(){
    for(const [pane,b] of buttons){if(!pane.isConnected){if(armed===pane)setArmed(null);buttons.delete(pane);}}
    for(const [selector,tools] of [['.reference-pane','.reference-toolbar']]){
      const pane=document.querySelector(selector),bar=pane?.querySelector(tools);
      if(!pane||!bar||buttons.has(pane))continue;
      const b=newButton('구절 인식',()=>{if(armed===pane)setArmed(null);else{close();setArmed(pane);}});
      b.className='ocr-toggle';b.setAttribute('aria-pressed','false');b.title='짧은 영역을 선택해 이 브라우저에서 글자로 인식';bar.append(b);buttons.set(pane,b);
    }
    const right=document.querySelector('.reference-pane');if(buttons.has(right)){
      const b=buttons.get(right);b.hidden=!right.querySelector('.source-image img');if(b.hidden&&armed===right)setArmed(null);
    }
  }
  document.addEventListener('pointerdown',acquire,true);document.addEventListener('pointermove',move,true);document.addEventListener('pointerup',end,true);
  document.addEventListener('pointercancel',e=>{if(drag?.id===e.pointerId)finishDrag();},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&armed){finishDrag();setArmed(null);}});
  window.addEventListener('pagehide',()=>{finishDrag();close();});
  let queued=false;
  const observer=new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;sync();});}});
  observer.observe(document.body,{childList:true,subtree:true});sync();
})();
