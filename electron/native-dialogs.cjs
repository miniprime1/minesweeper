'use strict';
const path=require('node:path');
const {validDialogSnapshot,validDialogAction,validDialogSize}=require('./dialog-policy.cjs');
const DIALOG_URL='minesweeper://app/native-dialog.html';
class NativeDialogs{
  constructor({BrowserWindow,screen,parent,zoom,sendToParent}){Object.assign(this,{BrowserWindow,screen,parent,zoom,sendToParent});this.window=null;this.snapshot=null;this.ready=false;this.firstSize=true;this.lastSize=null;this.closingToken=null;}
  update(value){
    if(value===null){this.close();return true;}
    if(!validDialogSnapshot(value))return false;
    const changed=this.snapshot?.token!==value.token;
    if(changed)this.closingToken=null;
    this.snapshot=value;
    if(!this.window)this.create();
    else{this.window.setTitle(value.title);if(this.ready)this.window.webContents.send('minesweeper:dialog-snapshot',value);if(changed)this.focus();}
    return true;
  }
  create(){
    const parent=this.parent();if(!parent)return;
    const win=new this.BrowserWindow({parent,modal:false,width:360,height:280,useContentSize:true,show:false,frame:false,roundedCorners:false,backgroundColor:'#c0c0c0',hasShadow:false,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,title:this.snapshot.title,webPreferences:{preload:path.join(__dirname,'dialog-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,spellcheck:false}});
    this.window=win;this.ready=false;this.firstSize=true;this.lastSize=null;
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(event,url)=>{if(url!==DIALOG_URL)event.preventDefault();});
    win.webContents.on('will-attach-webview',event=>event.preventDefault());
    win.webContents.on('did-fail-load',(_event,code)=>{if(code!==-3)this.fail(win);});
    win.webContents.on('render-process-gone',()=>this.fail(win));
    win.webContents.on('preload-error',()=>this.fail(win));
    win.on('close',event=>{if(this.window!==win||!this.snapshot)return;event.preventDefault();if(this.closingToken===this.snapshot.token)return;this.closingToken=this.snapshot.token;this.sendToParent({token:this.snapshot.token,kind:'close',id:'',fields:[]});});
    win.on('closed',()=>{if(this.window===win){this.window=null;this.ready=false;}});
    win.loadURL(DIALOG_URL).catch(()=>this.fail(win));
  }
  trusted(event){const win=this.window;return !!win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame.url===DIALOG_URL;}
  handleReady(event){if(!this.trusted(event)||!this.snapshot)return;this.ready=true;this.window.webContents.send('minesweeper:dialog-snapshot',this.snapshot);}
  handleAction(event,value){
    if(!this.trusted(event)||!validDialogAction(value)||value.token!==this.snapshot?.token)return false;
    const ids=new Set([...this.snapshot.html.matchAll(/data-native-id="(n\d{1,3})"/g)].map(match=>match[1]));
    const fieldIds=new Set(this.snapshot.fields.map(field=>field.id));
    if(value.kind!=='close'&&!ids.has(value.id)||value.fields.some(field=>!fieldIds.has(field.id)))return false;
    this.sendToParent(value);return true;
  }
  handleSize(event,value){if(!this.trusted(event)||!validDialogSize(value)||value.token!==this.snapshot?.token)return;this.lastSize=value;this.applySize();}
  applySize(){
    const win=this.window,value=this.lastSize,parent=this.parent();if(!win||!value||!parent)return;
    const area=this.screen.getDisplayMatching(parent.getBounds()).workArea;
    const scale=Math.min(this.zoom(),2,area.width/value.width,area.height/value.height);
    const width=Math.max(1,Math.round(value.width*scale)),height=Math.max(1,Math.round(value.height*scale));
    win.webContents.setZoomFactor(scale);win.setContentSize(width,height,false);
    const current=win.getBounds(),owner=parent.getBounds();
    const x=this.firstSize?Math.round(owner.x+(owner.width-width)/2):current.x;
    const y=this.firstSize?Math.round(owner.y+(owner.height-height)/2):current.y;
    win.setPosition(Math.max(area.x,Math.min(x,area.x+area.width-width)),Math.max(area.y,Math.min(y,area.y+area.height-height)),false);
    if(this.firstSize){this.firstSize=false;win.show();win.focus();}
  }
  refreshZoom(){this.applySize();}
  focus(){if(this.window&&!this.window.isDestroyed()){this.window.show();this.window.focus();}}
  close(){const win=this.window;this.window=null;this.snapshot=null;this.ready=false;this.lastSize=null;this.closingToken=null;if(win&&!win.isDestroyed())win.destroy();}
  fail(win){if(this.window!==win)return;const token=this.snapshot?.token;this.close();if(token)this.sendToParent({token,kind:'close',id:'',fields:[]});}
}
module.exports={NativeDialogs,DIALOG_URL};
