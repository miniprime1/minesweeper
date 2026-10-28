'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');
const source=fs.readFileSync(require.resolve('../../electron/preload.cjs'),'utf8');

async function renderer(){
  const sent=[],ipc=new EventEmitter(),listeners=new Map();
  ipc.send=(channel,value)=>sent.push({channel,value});
  const field={tagName:'INPUT',value:'16',checked:false,dataset:{}};
  const modal={hidden:false};
  const close={tagName:'BUTTON',dataset:{},click(){modal.hidden=true;}};
  const ok={tagName:'BUTTON',dataset:{},click(){modal.hidden=true;}};
  const dialog={
    querySelectorAll:()=>[close,field,ok],
    querySelector:selector=>selector==='.title-text'?{textContent:'Custom Field'}:close,
    get outerHTML(){return '<section class="window dialog"><button data-native-id="n0"></button><input data-native-id="n1"><button data-native-id="n2"></button></section>';},
  };
  modal.querySelector=()=>dialog;
  const game={hidden:false,offsetWidth:282,offsetHeight:363};
  const progressAttributes={'data-game-state':'ready','data-revealed':'0','data-safe-total':'216'};
  const board={getAttribute:name=>progressAttributes[name]};
  const elements={'game-window':game,desktop:{},'modal-layer':modal,board};
  const document={
    getElementById:id=>elements[id]||null,
    querySelectorAll:()=>[],querySelector:()=>null,images:[],
    fonts:{ready:Promise.resolve()},addEventListener(){},
  };
  let mutation;
  class Observer{constructor(callback){mutation??=callback;}observe(){}}
  vm.runInNewContext(source,{
    require:name=>{assert.equal(name,'electron');return{ipcRenderer:ipc};},
    window:{addEventListener:(name,callback)=>listeners.set(name,callback)},
    document,MutationObserver:Observer,ResizeObserver:Observer,queueMicrotask,
    // A fully occluded macOS parent has no animation frame callbacks.
    requestAnimationFrame(){},Event,
  });
  await listeners.get('DOMContentLoaded')();
  return{sent,ipc,field,modal,game,progressAttributes,mutate:()=>mutation(),send(value){ipc.emit('minesweeper:dialog-action',{},value);}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('a dialog larger than the board never expands the parent game extent',async()=>{
  const app=await renderer();
  const layout=app.sent.find(item=>item.channel==='minesweeper:layout').value;
  assert.deepEqual(JSON.parse(JSON.stringify(layout)),{base:{width:282,height:363},extent:{width:282,height:363}});
  const snapshot=app.sent.find(item=>item.channel==='minesweeper:dialog').value;
  assert.equal(snapshot.title,'Custom Field');
  assert.equal(snapshot.fields[0].value,'16');
});

test('child form values and closing synchronize while parent animation frames are paused',async()=>{
  const app=await renderer();
  app.send({token:1,kind:'click',id:'n2',fields:[{id:'n1',value:'24',checked:false}]});
  assert.equal(app.field.value,'24');
  assert.equal(app.modal.hidden,true);
  await flush();
  assert.equal(app.sent.filter(item=>item.channel==='minesweeper:dialog').at(-1).value,null);
  const count=app.sent.length;
  app.send({token:1,kind:'close',id:'',fields:[]});
  await flush();
  assert.equal(app.sent.length,count,'late child messages cannot reopen or close another dialog');
});
test('progress updates reach the Dock even when the game is minimized and painting is paused',async()=>{
  const app=await renderer();
  const updates=()=>app.sent.filter(item=>item.channel==='minesweeper:progress');
  assert.equal(updates().at(-1).value.state,'ready');
  app.game.hidden=true;
  app.progressAttributes['data-game-state']='playing';app.progressAttributes['data-revealed']='54';
  app.mutate();await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(updates().at(-1).value)),{state:'playing',revealed:54,total:216});
  const count=updates().length;app.mutate();await flush();assert.equal(updates().length,count);
});
