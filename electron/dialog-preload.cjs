'use strict';
const {ipcRenderer}=require('electron');
let host=null,current=null,pending=null,lastHTML='',lastFields=new Map(),measureScheduled=false;
const nativeID=node=>node?.getAttribute('data-native-id')||'';
const validID=value=>typeof value==='string'&&/^n\d{1,5}$/.test(value);
const fieldNodes=()=>[...host.querySelectorAll('input[data-native-id],select[data-native-id],textarea[data-native-id]')];
function fields(){
  return fieldNodes().map(node=>({id:nativeID(node),value:String(node.value),checked:!!node.checked})).filter(field=>validID(field.id));
}
function action(kind,node){
  if(!current)return;
  const id=kind==='close'?'':nativeID(node);
  if(kind!=='close'&&!validID(id))return;
  ipcRenderer.send('minesweeper:dialog-action',{token:current.token,kind,id,fields:fields()});
}
function scheduleMeasure(){
  if(measureScheduled)return;
  measureScheduled=true;
  requestAnimationFrame(()=>{
    measureScheduled=false;
    const dialog=host?.querySelector('.window.dialog');
    if(!current||!dialog)return;
    ipcRenderer.send('minesweeper:dialog-size',{token:current.token,width:Math.ceil(dialog.offsetWidth),height:Math.ceil(dialog.offsetHeight)});
  });
}
function focusState(){
  const node=document.activeElement;
  if(!node||!host.contains(node))return null;
  const state={id:nativeID(node)};
  try{state.start=node.selectionStart;state.end=node.selectionEnd;state.direction=node.selectionDirection;}catch{}
  return state;
}
function restoreFocus(state){
  if(!state?.id)return;
  const node=[...host.querySelectorAll('[data-native-id]')].find(candidate=>nativeID(candidate)===state.id);
  if(!node)return;
  node.focus({preventScroll:true});
  if(typeof state.start==='number')try{node.setSelectionRange(state.start,state.end,state.direction);}catch{}
}
function render(snapshot){
  if(!snapshot||!Number.isSafeInteger(snapshot.token)||snapshot.token<1||typeof snapshot.html!=='string'||snapshot.html.length>262144||!Array.isArray(snapshot.fields))return;
  const sameToken=current?.token===snapshot.token;
  const previousLocal=sameToken?new Map(fields().map(field=>[field.id,field])):new Map();
  const focus=sameToken?focusState():null;
  const htmlChanged=!sameToken||snapshot.html!==lastHTML;
  if(htmlChanged){
    const template=document.createElement('template');template.innerHTML=snapshot.html;
    const section=template.content.firstElementChild;
    if(!section?.matches('section.window.dialog')||template.content.children.length!==1)return;
    section.querySelectorAll('script,iframe,object,embed,style,link,meta,base').forEach(node=>node.remove());
    for(const node of [section,...section.querySelectorAll('*')])for(const attribute of [...node.attributes]){
      if(/^on/i.test(attribute.name)||attribute.name==='srcdoc')node.removeAttribute(attribute.name);
    }
    host.replaceChildren(section);
  }
  const incoming=new Map(snapshot.fields.filter(field=>validID(field?.id)&&typeof field.value==='string').map(field=>[field.id,{value:field.value,checked:!!field.checked}]));
  for(const node of fieldNodes()){
    const id=nativeID(node),next=incoming.get(id),previous=lastFields.get(id),local=previousLocal.get(id);
    if(!next)continue;
    // A zoom/options refresh must not overwrite text still being edited locally.
    const unchanged=sameToken&&previous&&next.value===previous.value&&next.checked===previous.checked;
    const desired=unchanged&&local?local:next;
    if(node.value!==desired.value)node.value=desired.value;
    if('checked'in node&&node.checked!==desired.checked)node.checked=desired.checked;
  }
  current={token:snapshot.token};lastHTML=snapshot.html;lastFields=incoming;
  document.title=typeof snapshot.title==='string'?snapshot.title:'Minesweeper';
  if(sameToken){if(htmlChanged)restoreFocus(focus);}
  else{
    const first=host.querySelector('[autofocus]')||host.querySelector('.default')||host.querySelector('button');
    first?.focus({preventScroll:true});
    if(first?.matches('input[autofocus]'))try{first.select();}catch{}
  }
  if(htmlChanged)scheduleMeasure();
}
ipcRenderer.on('minesweeper:dialog-snapshot',(_event,snapshot)=>{if(host)render(snapshot);else pending=snapshot;});
window.addEventListener('DOMContentLoaded',async()=>{
  host=document.getElementById('native-dialog-host');
  document.addEventListener('click',event=>{
    const node=event.target.closest('button[data-native-id],a[data-native-id]');
    if(!node||!host.contains(node))return;
    event.preventDefault();event.stopImmediatePropagation();action('click',node);
  },true);
  document.addEventListener('change',event=>{
    if(!event.target.matches('input[data-native-id],select[data-native-id],textarea[data-native-id]'))return;
    event.preventDefault();event.stopImmediatePropagation();action('change',event.target);
  },true);
  document.addEventListener('submit',event=>{
    if(!host.contains(event.target))return;
    event.preventDefault();event.stopImmediatePropagation();action('submit',event.target);
  },true);
  document.addEventListener('keydown',event=>{
    if(event.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();action('close');return;}
    if(event.key!=='Enter'||event.altKey||event.ctrlKey||event.metaKey)return;
    const target=event.target instanceof Element?event.target:host;
    if(target.matches('textarea,select'))return;
    const button=target.closest('button[data-native-id],a[data-native-id]');
    const form=target.closest('form[data-native-id]');
    const fallback=host.querySelector('.default[data-native-id]');
    if(!button&&!form&&!fallback)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(button)action('click',button);else if(form)action('submit',form);else action('click',fallback);
  },true);
  await Promise.allSettled([document.fonts.load('11px "MS Sans Serif"'),document.fonts.load('bold 11px "MS Sans Serif"')]);
  await document.fonts.ready;
  if(pending){render(pending);pending=null;}
  ipcRenderer.send('minesweeper:dialog-ready');
  scheduleMeasure();
});
