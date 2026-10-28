'use strict';
function validProgress(value){
  return !!value&&['ready','playing','won','lost'].includes(value.state)
    &&Number.isInteger(value.total)&&value.total>0&&value.total<=720
    &&Number.isInteger(value.revealed)&&value.revealed>=0&&value.revealed<=value.total
    &&(value.state!=='ready'||value.revealed===0)
    &&(value.state!=='won'||value.revealed===value.total);
}
class TaskbarProgress{
  constructor({window,dock,Menu}){Object.assign(this,{window,dock,Menu});this.last='';}
  update(value){
    const win=this.window();
    if(!validProgress(value)||!win||win.isDestroyed())return false;
    const key=JSON.stringify(value);if(key===this.last)return true;this.last=key;
    const fraction=value.revealed/value.total;
    const percent=value.state==='won'?100:Math.min(99,Math.floor(fraction*100));
    win.setProgressBar(['playing','won'].includes(value.state)?fraction:-1);
    const label=value.state==='won'?'Won · 100%':value.state==='lost'?`Game over · ${percent}%`:`Progress: ${percent}%`;
    this.dock?.setMenu(this.Menu.buildFromTemplate([{label,enabled:false}]));
    return true;
  }
  reset(){this.last='';const win=this.window();if(win&&!win.isDestroyed())win.setProgressBar(-1);this.dock?.setMenu(this.Menu.buildFromTemplate([]));}
}
module.exports={validProgress,TaskbarProgress};
