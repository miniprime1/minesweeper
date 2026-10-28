'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {NativeDialogs,DIALOG_URL}=require('../../electron/native-dialogs.cjs');
class FakeContents extends EventEmitter{
  constructor(){super();this.mainFrame={url:DIALOG_URL};this.messages=[];this.zoom=1;}
  setWindowOpenHandler(handler){this.openHandler=handler;}
  send(...message){this.messages.push(message);}
  setZoomFactor(value){this.zoom=value;}
}
class FakeWindow extends EventEmitter{
  constructor(options){super();this.options=options;this.webContents=new FakeContents();this.bounds={x:0,y:0,width:options.width,height:options.height};this.destroyed=false;this.shown=0;this.focused=0;this.sizeCalls=[];}
  loadURL(url){this.url=url;return Promise.resolve();}
  isDestroyed(){return this.destroyed;}
  destroy(){if(this.destroyed)return;this.destroyed=true;this.emit('closed');}
  close(){const event={prevented:false,preventDefault(){this.prevented=true;}};this.emit('close',event);if(!event.prevented)this.destroy();return event;}
  getBounds(){return {...this.bounds};}
  setContentSize(width,height){this.sizeCalls.push({width,height});Object.assign(this.bounds,{width,height});}
  setPosition(x,y){Object.assign(this.bounds,{x,y});}
  setTitle(title){this.title=title;}
  show(){this.shown++;}
  focus(){this.focused++;}
}
const snapshot=(token=1)=>({token,title:'Custom Field',html:'<section class="window dialog"><form data-native-id="n0"><input data-native-id="n1"><button data-native-id="n2">OK</button></form></section>',fields:[{id:'n1',value:'16',checked:false}]});
const eventFor=win=>({sender:win.webContents,senderFrame:win.webContents.mainFrame});
function setup(Window=FakeWindow){
  const owner={getBounds:()=>({x:200,y:200,width:282,height:363})},sent=[];
  let zoom=1.5;
  const manager=new NativeDialogs({BrowserWindow:Window,parent:()=>owner,screen:{getDisplayMatching:()=>({workArea:{x:0,y:0,width:2000,height:1600}})},zoom:()=>zoom,sendToParent:value=>sent.push(value)});
  return {manager,owner,sent,setZoom:value=>{zoom=value;}};
}
test('dialogs use a separate parented movable non-modal window and isolated renderer',()=>{
  const {manager,owner}=setup();assert.equal(manager.update(snapshot()),true);
  const child=manager.window;
  assert.equal(child.options.parent,owner);assert.equal(child.options.modal,false);assert.equal(child.options.frame,false);assert.equal(child.options.resizable,false);assert.equal(child.options.show,false);
  assert.equal(child.options.webPreferences.nodeIntegration,false);assert.equal(child.options.webPreferences.contextIsolation,true);assert.equal(child.options.webPreferences.sandbox,true);
  assert.equal(child.url,DIALOG_URL);assert.deepEqual(child.webContents.openHandler({url:'https://example.com'}),{action:'deny'});
  manager.handleReady(eventFor(child));assert.deepEqual(child.webContents.messages.at(-1),['minesweeper:dialog-snapshot',snapshot()]);
  manager.close();assert.equal(child.destroyed,true);
});
test('only the active child main frame, token, and current UI elements can forward actions',()=>{
  const {manager,sent}=setup();manager.update(snapshot());const child=manager.window,event=eventFor(child);
  const action={token:1,kind:'click',id:'n2',fields:[{id:'n1',value:'24',checked:false}]};
  assert.equal(manager.handleAction(event,action),true);assert.deepEqual(sent,[action]);
  const badEvents=[{...event,sender:new FakeContents()},{...event,senderFrame:{url:DIALOG_URL}}];
  for(const bad of badEvents)assert.equal(manager.handleAction(bad,action),false);
  child.webContents.mainFrame.url='minesweeper://app/index.html';assert.equal(manager.handleAction(event,action),false);child.webContents.mainFrame.url=DIALOG_URL;
  for(const bad of [{...action,token:2},{...action,id:'n9'},{...action,fields:[{id:'n9',value:'1',checked:false}]},{...action,kind:'execute'}])assert.equal(manager.handleAction(event,bad),false);
  assert.equal(sent.length,1);
  manager.update(snapshot(2));assert.equal(manager.handleAction(event,action),false);manager.close();
});
test('native close forwards once while the source dialog waits to acknowledge closing',()=>{
  const {manager,sent}=setup();manager.update(snapshot());const child=manager.window;
  assert.equal(child.close().prevented,true);assert.equal(child.close().prevented,true);
  assert.deepEqual(sent,[{token:1,kind:'close',id:'',fields:[]}]);assert.equal(manager.window,child);assert.equal(child.destroyed,false);
  manager.update(snapshot(2));child.close();assert.equal(sent.length,2);assert.equal(sent[1].token,2);
  manager.update(null);assert.equal(child.destroyed,true);assert.equal(manager.window,null);
});
test('destroyed child events and stale actions cannot close a replacement dialog',()=>{
  const {manager,sent}=setup();manager.update(snapshot());const old=manager.window;
  manager.update(null);manager.update(snapshot(2));const current=manager.window;
  old.emit('close',{preventDefault(){throw new Error('stale close intercepted');}});old.webContents.emit('render-process-gone');old.webContents.emit('did-fail-load',{},-6);
  assert.equal(manager.handleAction(eventFor(old),{token:1,kind:'close',id:'',fields:[]}),false);
  assert.equal(manager.window,current);assert.equal(current.destroyed,false);assert.deepEqual(sent,[]);manager.close();
});
test('window size follows measured pixels and zoom without resetting a dragged position',()=>{
  const {manager,setZoom}=setup();manager.update(snapshot());const child=manager.window,event=eventFor(child);
  manager.handleSize(event,{token:1,width:300,height:200});
  assert.deepEqual(child.getBounds(),{x:116,y:232,width:450,height:300});assert.equal(child.webContents.zoom,1.5);assert.equal(child.shown,1);
  child.setPosition(650,500);setZoom(2);manager.refreshZoom();
  assert.deepEqual(child.getBounds(),{x:650,y:500,width:600,height:400});assert.equal(child.shown,1);
  manager.handleSize(event,{token:999,width:400,height:300});assert.deepEqual(child.getBounds(),{x:650,y:500,width:600,height:400});
  manager.update({...snapshot(),title:'Updated',html:snapshot().html+' '});assert.equal(child.title,'Updated');assert.deepEqual(child.getBounds(),{x:650,y:500,width:600,height:400});manager.close();
});
test('failed load or renderer exits destroy the child and close the source dialog once',()=>{
  for(const failure of ['did-fail-load','render-process-gone','preload-error']){
    const {manager,sent}=setup();manager.update(snapshot());const child=manager.window;
    if(failure==='did-fail-load'){child.webContents.emit(failure,{},-3);assert.equal(manager.window,child);child.webContents.emit(failure,{},-6);}
    else child.webContents.emit(failure);
    assert.equal(child.destroyed,true);assert.equal(manager.window,null);assert.deepEqual(sent,[{token:1,kind:'close',id:'',fields:[]}]);
    child.webContents.emit(failure,{},-6);assert.equal(sent.length,1);
  }
});
test('rejected load promises also release the source dialog',async()=>{
  class FailedWindow extends FakeWindow{loadURL(){return Promise.reject(new Error('missing dialog HTML'));}}
  const {manager,sent}=setup(FailedWindow);manager.update(snapshot());const child=manager.window;
  await Promise.resolve();assert.equal(child.destroyed,true);assert.equal(manager.window,null);assert.deepEqual(sent,[{token:1,kind:'close',id:'',fields:[]}]);
});
