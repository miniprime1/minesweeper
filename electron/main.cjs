'use strict';
const {app,BrowserWindow,Menu,ipcMain,protocol,net,screen,shell,session}=require('electron');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs/promises');
const {mkdirSync,existsSync}=require('node:fs');
const {ORIGIN,trustedURL,assetPath,validLayout,allowedExternal}=require('./policy.cjs');
const {MIN_ZOOM,MAX_ZOOM,clampZoom,fitLayout,zoomFromBounds}=require('./window-layout.cjs');
const {NativeDialogs}=require('./native-dialogs.cjs');
const {TaskbarProgress}=require('./taskbar-progress.cjs');
const smokeTest=process.argv.includes('--smoke-test');
const screenshotArgument=process.argv.find(value=>value.startsWith('--capture='));
app.setName('Minesweeper');
const legacyData=path.join(app.getPath('appData'),'Minesweeper 2000');
if(existsSync(legacyData))app.setPath('userData',legacyData);
if(smokeTest){
  const testData=path.join(os.tmpdir(),'minesweeper-desktop-test');
  mkdirSync(testData,{recursive:true});
  app.setPath('userData',testData);app.setPath('sessionData',path.join(testData,'session'));
}
protocol.registerSchemesAsPrivileged([{scheme:'minesweeper',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
let window=null,firstFit=true,sizing=false,expectedSize=null,saveTimer=null;
let preferredZoom=1,zoom=1;
let layout={base:{width:282,height:363},extent:{width:282,height:363}};
let taskbarProgress=null;
const nativeDialogs=new NativeDialogs({BrowserWindow,screen,parent:()=>window,zoom:()=>zoom,sendToParent:value=>window?.webContents.send('minesweeper:dialog-action',value)});
const senderIsTrusted=event=>window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&trustedURL(event.senderFrame.url);
const preferencePath=()=>path.join(app.getPath('userData'),'desktop-window.json');
function saveZoom(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>fs.writeFile(preferencePath(),JSON.stringify({zoom:preferredZoom})).catch(()=>{}),250);
}
function reportZoom(){
  if(!window||window.isDestroyed())return;
  window.webContents.send('minesweeper:zoom-state',zoom);
  nativeDialogs.refreshZoom();
  const item=Menu.getApplicationMenu()?.getMenuItemById('zoom-level');
  if(item)item.label='Zoom: '+Math.round(zoom*100)+'%';
}
function setZoom(value){preferredZoom=clampZoom(value);applyLayout();saveZoom();}
function applyLayout(){
  if(!window||window.isDestroyed())return;
  const area=screen.getDisplayMatching(window.getBounds()).workArea;
  const fitted=fitLayout(layout.extent,preferredZoom,area);
  zoom=fitted.zoom;sizing=true;
  window.setMinimumSize(fitted.minWidth,fitted.minHeight);
  window.setMaximumSize(fitted.maxWidth,fitted.maxHeight);
  window.setAspectRatio(layout.extent.width/layout.extent.height);
  window.webContents.setZoomFactor(zoom);
  const [width,height]=window.getContentSize();
  if(width!==fitted.width||height!==fitted.height){expectedSize={width:fitted.width,height:fitted.height};window.setContentSize(fitted.width,fitted.height,false);}
  if(firstFit){window.center();firstFit=false;}
  else{
    const bounds=window.getBounds();
    window.setPosition(Math.max(area.x,Math.min(bounds.x,area.x+area.width-bounds.width)),Math.max(area.y,Math.min(bounds.y,area.y+area.height-bounds.height)),false);
  }
  sizing=false;reportZoom();
}
if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
  app.whenReady().then(async()=>{
    taskbarProgress=new TaskbarProgress({window:()=>window,dock:app.dock,Menu});
    try{preferredZoom=clampZoom(JSON.parse(await fs.readFile(preferencePath(),'utf8')).zoom);}catch{}
    const root=path.resolve(__dirname,'../web');
    protocol.handle('minesweeper',async request=>{
      const file=assetPath(root,request.url);
      if(!file||request.method!=='GET')return new Response('Not found',{status:404});
      try{
        const response=await net.fetch(pathToFileURL(file).href),headers=new Headers(response.headers);
        headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'");
        return new Response(response.body,{status:response.status,headers});
      }catch{return new Response('Not found',{status:404});}
    });
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    ipcMain.on('minesweeper:layout',(event,value)=>{
      if(!senderIsTrusted(event)||!validLayout(value))return;
      if(JSON.stringify(layout)!==JSON.stringify(value)){layout=value;applyLayout();}else reportZoom();
    });
    ipcMain.on('minesweeper:zoom',(event,value)=>{
      if(senderIsTrusted(event)&&typeof value==='number'&&Number.isFinite(value)&&value>=MIN_ZOOM&&value<=MAX_ZOOM)setZoom(value);
    });
    ipcMain.on('minesweeper:progress',(event,value)=>{if(senderIsTrusted(event))taskbarProgress.update(value);});
    ipcMain.on('minesweeper:external',(event,value)=>{if(senderIsTrusted(event)&&allowedExternal(value))shell.openExternal(value).catch(()=>{});});
    ipcMain.on('minesweeper:dialog',(event,value)=>{if(senderIsTrusted(event))nativeDialogs.update(value);});
    ipcMain.on('minesweeper:dialog-ready',event=>nativeDialogs.handleReady(event));
    ipcMain.on('minesweeper:dialog-action',(event,value)=>nativeDialogs.handleAction(event,value));
    ipcMain.on('minesweeper:dialog-size',(event,value)=>nativeDialogs.handleSize(event,value));
    ipcMain.on('minesweeper:action',(event,action)=>{
      if(!senderIsTrusted(event))return;
      if(action==='minimize')window.minimize();
      else if(action==='close')window.close();
      else if(action==='ready'){applyLayout();window.show();}
      else if(action==='focus-dialog')nativeDialogs.focus();
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label:app.name,submenu:[{label:'About Minesweeper',click:()=>{if(!window)return;if(window.isMinimized())window.restore();window.show();window.webContents.send('minesweeper:about');}},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
      {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
      {label:'View',submenu:[{id:'zoom-level',label:'Zoom: 100%',enabled:false},{type:'separator'},{label:'Zoom In',accelerator:'CommandOrControl+Plus',click:()=>setZoom(zoom+0.25)},{label:'Zoom Out',accelerator:'CommandOrControl+-',click:()=>setZoom(zoom-0.25)},{label:'Actual Size',accelerator:'CommandOrControl+0',click:()=>setZoom(1)}]},
      {role:'windowMenu'}
    ]));
    createWindow();
  }).catch(error=>{console.error(error);app.exit(1);});
  app.on('activate',()=>{if(!window)createWindow();else{if(window.isMinimized())window.restore();window.show();window.focus();}});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>{clearTimeout(saveTimer);fs.writeFile(preferencePath(),JSON.stringify({zoom:preferredZoom})).catch(()=>{});});
}
function createWindow(){
  window=new BrowserWindow({width:282,height:363,useContentSize:true,show:false,frame:false,roundedCorners:false,transparent:false,backgroundColor:'#c0c0c0',hasShadow:false,resizable:true,minWidth:128,minHeight:189,maximizable:false,fullscreenable:false,title:'Minesweeper',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,spellcheck:false}});
  firstFit=true;
  window.webContents.setVisualZoomLevelLimits(1,1);
  window.webContents.setWindowOpenHandler(({url})=>{if(allowedExternal(url))shell.openExternal(url);return{action:'deny'};});
  window.webContents.on('will-navigate',(event,url)=>{if(!trustedURL(url))event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.webContents.on('did-fail-load',(_event,code,description)=>console.error('Load failed',code,description));
  window.on('resize',()=>{
    if(sizing||!window)return;
    const [width,height]=window.getContentSize();
    if(expectedSize&&Math.abs(width-expectedSize.width)<=1&&Math.abs(height-expectedSize.height)<=1){expectedSize=null;reportZoom();return;}
    expectedSize=null;
    const next=zoomFromBounds({width,height},layout.extent);
    if(Math.abs(next-zoom)<0.005)return;
    zoom=next;preferredZoom=next;window.webContents.setZoomFactor(zoom);reportZoom();saveZoom();
  });
  window.on('minimize',()=>window?.webContents.send('minesweeper:minimize'));
  window.on('restore',()=>window?.webContents.send('minesweeper:restore'));
  window.on('close',()=>{nativeDialogs.close();taskbarProgress?.reset();});
  window.on('closed',()=>{window=null;});
  window.loadURL(ORIGIN+'/index.html');
  if(smokeTest)window.webContents.once('did-finish-load',()=>runSmokeTest().catch(error=>{console.error(error);app.exit(1);}));
}
async function runSmokeTest(){
  const result=await window.webContents.executeJavaScript(`(async()=>{
    await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));
    const board=document.getElementById('board');
    const initial={cells:board.children.length,node:typeof require,face:document.getElementById('face-image').naturalWidth,origin:location.origin};
    const first=board.children[0],r=first.getBoundingClientRect(),event={bubbles:true,clientX:r.x+8,clientY:r.y+8};
    first.dispatchEvent(new MouseEvent('mousedown',{...event,button:2,buttons:2}));first.dispatchEvent(new MouseEvent('mouseup',{...event,button:2,buttons:0}));const flag=first.dataset.state;
    first.dispatchEvent(new MouseEvent('mousedown',{...event,button:2,buttons:2}));first.dispatchEvent(new MouseEvent('mouseup',{...event,button:2,buttons:0}));const question=first.dataset.state;
    first.dispatchEvent(new MouseEvent('mousedown',{...event,button:0,buttons:1}));first.dispatchEvent(new MouseEvent('mouseup',{...event,button:0,buttons:0}));const revealed=first.dataset.state;
    document.getElementById('face').click();return{initial,flag,question,revealed};
  })()`);
  if(result.initial.face!==130||result.initial.node!=='undefined'||result.flag!=='flag'||result.question!=='question'||result.revealed!=='revealed')throw new Error('Desktop smoke test failed: '+JSON.stringify(result));
  console.log('DESKTOP_SMOKE_TEST '+JSON.stringify(result));
  setZoom(1.5);await new Promise(resolve=>setTimeout(resolve,200));
  if(screenshotArgument){const image=await window.webContents.capturePage();await fs.writeFile(screenshotArgument.slice('--capture='.length),image.toPNG());}
  app.quit();
}
