'use strict';
const {ipcRenderer}=require('electron');
window.addEventListener('DOMContentLoaded',async()=>{
  const game=document.getElementById('game-window'),desktop=document.getElementById('desktop'),modal=document.getElementById('modal-layer');
  let scheduled=false,lastLayout='',zoom=1;
  let lastProgress='';
  function reportProgress(){
    const board=document.getElementById('board');if(!board)return;
    const value={state:board.getAttribute('data-game-state'),revealed:Number(board.getAttribute('data-revealed')),total:Number(board.getAttribute('data-safe-total'))};
    if(!value.state||!value.total)return;
    const key=JSON.stringify(value);if(key===lastProgress)return;lastProgress=key;
    ipcRenderer.send('minesweeper:progress',value);
  }
  let sourceDialog=null,dialogToken=0,nativeDialogOpen=false,lastSnapshot='';
  const dialogElements=new Map();
  function syncDialog(){
    const dialog=modal.querySelector('.dialog');
    if(modal.hidden||!dialog){
      if(nativeDialogOpen){nativeDialogOpen=false;sourceDialog=null;lastSnapshot='';dialogElements.clear();ipcRenderer.send('minesweeper:dialog',null);}
      return;
    }
    if(dialog!==sourceDialog){
      sourceDialog=dialog;dialogToken++;dialogElements.clear();
      for(const [index,node] of [...dialog.querySelectorAll('button,input,select,textarea,form,a[href]')].entries()){
        const id='n'+index;node.dataset.nativeId=id;dialogElements.set(id,node);
      }
    }
    nativeDialogOpen=true;
    const fields=[...dialogElements].filter(([,node])=>['INPUT','SELECT','TEXTAREA'].includes(node.tagName)).map(([id,node])=>({id,value:node.value,checked:Boolean(node.checked)}));
    const value={token:dialogToken,title:dialog.querySelector('.title-text')?.textContent||'Minesweeper',html:dialog.outerHTML,fields};
    const key=JSON.stringify(value);
    if(key!==lastSnapshot){lastSnapshot=key;ipcRenderer.send('minesweeper:dialog',value);}
  }
  function updateZoomControl(){
    const select=document.getElementById('pixel-scale');
    if(!select)return;
    const percent=Math.round(zoom*100),key=String(percent);
    if(select.dataset.zoomPercent===key)return;
    select.dataset.zoomPercent=key;
    const values=[0.75,1,1.25,1.5,2,3,4];if(!values.some(value=>Math.round(value*100)===percent))values.push(zoom);
    select.replaceChildren(...values.sort((a,b)=>a-b).map(value=>{const option=document.createElement('option');option.value=String(value);option.textContent=Math.round(value*100)+'%';return option;}));
    select.value=String(values.find(value=>Math.round(value*100)===percent));
    const label=document.querySelector('label[for="pixel-scale"]');if(label)label.textContent='Zoom:';
  }
  function fit(){
    scheduled=false;reportProgress();if(game.hidden)return;
    const base={width:game.offsetWidth,height:game.offsetHeight};
    let width=base.width,height=base.height;
    for(const menu of document.querySelectorAll('.dropdown:not([hidden])')){const bounds=menu.getBoundingClientRect();width=Math.max(width,bounds.right);height=Math.max(height,bounds.bottom);}
    const value={base,extent:{width:Math.max(170,Math.ceil(width)),height:Math.max(200,Math.ceil(height))}},key=JSON.stringify(value);
    if(key!==lastLayout){lastLayout=key;ipcRenderer.send('minesweeper:layout',value);}
    updateZoomControl();
    syncDialog();
  }
  // A larger child can fully cover this window. macOS then pauses its animation
  // frames, so dialog close/replace messages must not wait for a paint frame.
  function scheduleFit(){if(!scheduled){scheduled=true;queueMicrotask(fit);}}
  for(const type of ['pointerdown','mousedown','touchstart','click','keydown'])document.addEventListener(type,event=>{
    if(!nativeDialogOpen||event.target?.closest?.('#modal-layer,#title-bar')||event.metaKey||event.ctrlKey)return;
    event.preventDefault();event.stopImmediatePropagation();ipcRenderer.send('minesweeper:action','focus-dialog');
  },{capture:true,passive:false});
  document.addEventListener('click',event=>{
    if(event.target.closest('#close-window,[data-action="exit"]')){event.preventDefault();event.stopImmediatePropagation();ipcRenderer.send('minesweeper:action','close');}
    else if(event.target.closest('#minimize'))ipcRenderer.send('minesweeper:action','minimize');
  },true);
  document.addEventListener('change',event=>{if(event.target.id==='pixel-scale'){event.stopImmediatePropagation();ipcRenderer.send('minesweeper:zoom',Number(event.target.value));}},true);
  ipcRenderer.on('minesweeper:zoom-state',(_event,value)=>{zoom=value;updateZoomControl();syncDialog();});
  ipcRenderer.on('minesweeper:dialog-action',(_event,value)=>{
    if(!nativeDialogOpen||value?.token!==dialogToken)return;
    for(const field of value.fields||[]){
      const node=dialogElements.get(field.id);if(!node||!['INPUT','SELECT','TEXTAREA'].includes(node.tagName))continue;
      node.value=field.value;if('checked'in node)node.checked=field.checked;
    }
    const node=dialogElements.get(value.id);
    if(value.kind==='close')sourceDialog.querySelector('.caption-button')?.click();
    else if(value.kind==='click'&&node?.tagName==='A')ipcRenderer.send('minesweeper:external',node.href);
    else if(value.kind==='click'&&node?.tagName==='BUTTON')node.click();
    else if(value.kind==='submit'&&node?.tagName==='FORM')node.requestSubmit();
    else if(value.kind==='change'&&node)node.dispatchEvent(new Event('change',{bubbles:true}));
    scheduleFit();
  });
  ipcRenderer.on('minesweeper:minimize',()=>{if(!game.hidden)document.getElementById('minimize').click();});
  ipcRenderer.on('minesweeper:restore',()=>{document.getElementById('restore-window').click();scheduleFit();});
  ipcRenderer.on('minesweeper:about',()=>{
    if(nativeDialogOpen){ipcRenderer.send('minesweeper:action','focus-dialog');return;}
    if(game.hidden)document.getElementById('restore-window').click();
    document.getElementById('help-menu-button').click();
    document.querySelector('#help-menu [data-action="about"]')?.click();
  });
  const observer=new MutationObserver(scheduleFit);
  observer.observe(desktop,{attributes:true,subtree:true,attributeFilter:['hidden','aria-expanded','data-game-state','data-revealed','data-safe-total'],childList:true});
  const resize=new ResizeObserver(scheduleFit);resize.observe(game);
  window.addEventListener('resize',scheduleFit);
  await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));
  fit();ipcRenderer.send('minesweeper:action','ready');
});
