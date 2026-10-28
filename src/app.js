import { Minefield, presets } from './engine.js';
import { SoundEffects } from './sound.js';

const $ = (id) => document.getElementById(id);
const storageKey = 'win2000-minesweeper-v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch {}
if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
const boundedInteger=(value,min,max,fallback)=>Number.isFinite(value)?Math.max(min,Math.min(max,Math.trunc(value))):fallback;
let settings = {difficulty:'intermediate',marks:true,color:true,sound:true,scale:1,...saved.settings};
if (!presets[settings.difficulty] && settings.difficulty !== 'custom') settings.difficulty = 'intermediate';
const custom=settings.custom||{},rows=boundedInteger(custom.rows,9,24,16),cols=boundedInteger(custom.cols,9,30,30);
settings.custom={rows,cols,mines:boundedInteger(custom.mines,10,(rows-1)*(cols-1),Math.min(99,(rows-1)*(cols-1)))};
settings.marks=typeof settings.marks==='boolean'?settings.marks:true;
settings.color=typeof settings.color==='boolean'?settings.color:true;
settings.sound=typeof settings.sound==='boolean'?settings.sound:true;
const sound=new SoundEffects({enabled:settings.sound});
for(const event of ['pointerdown','touchstart','keydown'])document.addEventListener(event,()=>sound.unlock(),{capture:true,passive:true});
settings.scale=[1,2,3].includes(settings.scale)?settings.scale:1;
let records = Object.fromEntries(Object.keys(presets).map(id=>{
  const record=saved.records?.[id];
  return [id,{time:boundedInteger(record?.time,0,999,999),name:typeof record?.name==='string'?record.name.slice(0,31):'Anonymous'}];
}));
const persist = () => {try{localStorage.setItem(storageKey,JSON.stringify({settings,records}));}catch{}};
let game, elapsed=0, clock=null, lastTick=0, pauseAt=null, menu=null, activeDialog=null, lastFocus=null;
let pendingRecord=null,recordPromptTimer=null;
let mouseButtons=0, hoverIndex=-1, isChording=false, suppressUntilRelease=false, faceDown=false;
let touch=null, longPress=null, keyIndex=0, keyboardFocus=false;
const board=$('board'), windowEl=$('game-window');
const tile = {closed:[0,0],empty:[16,0],flag:[32,0],question:[48,0],pressedQuestion:[64,0],mine:[80,0],wrong:[112,0],exploded:[96,0]};
const spritePosition = (node,pos) => {node.style.backgroundPosition=`-${pos[0]}px -${pos[1]}px`;};

function digits(id,value){
  const node=$(id);
  const shown=value<0?'-'+String(Math.min(99,Math.abs(value))).padStart(2,'0'):String(Math.min(999,value)).padStart(3,'0');
  if(node.dataset.value!==shown){node.replaceChildren(...[...shown].map(c=>{const d=document.createElement('span');d.className=c==='-'?'digit minus':'digit';d.style.backgroundPosition=`-${Number(c)*13||0}px 0px`;return d;}));node.dataset.value=shown;}
  node.setAttribute('aria-label',id==='timer'?`${value} seconds`:`${value} mines remaining`);
}
function setFace(){
  const index=faceDown?1:game.state==='won'?3:game.state==='lost'?4:mouseButtons&5||isChording?2:0;
  $('face-image').style.left=`-${index*26}px`;
}
function cellSprite(cell,index,pressed){
  if(game.state==='lost'){
    if(index===game.explodedIndex)return tile.exploded;
    if(cell.mark===1&&!cell.mine)return tile.wrong;
    if(cell.mine&&cell.mark!==1)return tile.mine;
  }
  if(cell.revealed)return cell.adjacent?[16*(cell.adjacent-1),16]:tile.empty;
  if(cell.mark===1)return tile.flag;
  if(pressed)return cell.mark===2?tile.pressedQuestion:tile.empty;
  return cell.mark===2?tile.question:tile.closed;
}
function render(){
  board.setAttribute('data-game-state',game.state);
  board.setAttribute('data-revealed',String(game.revealedCount));
  board.setAttribute('data-safe-total',String(game.cells.length-game.mines));
  const pressed=new Set();
  if((mouseButtons&5||isChording)&&hoverIndex>=0&&game.state!=='lost'&&game.state!=='won'){
    if(isChording){for(const n of [hoverIndex,...game.neighbors(hoverIndex)])if(!game.cells[n].revealed&&game.cells[n].mark!==1)pressed.add(n);}
    else if(!game.cells[hoverIndex].revealed&&game.cells[hoverIndex].mark!==1)pressed.add(hoverIndex);
  }
  for(let i=0;i<game.cells.length;i++){
    const cell=game.cells[i],node=board.children[i];
    spritePosition(node,cellSprite(cell,i,pressed.has(i)));
    node.dataset.state=cell.revealed?'revealed':cell.mark===1?'flag':cell.mark===2?'question':'closed';
    const desc=cell.revealed?(cell.mine?'Mine':cell.adjacent?`${cell.adjacent} adjacent mines`:'Empty'):cell.mark===1?'Flag':cell.mark===2?'Question mark':'Unopened';
    node.setAttribute('aria-label',`Row ${Math.floor(i/game.cols)+1}, column ${i%game.cols+1}: ${desc}`);
    node.classList.toggle('keyboard-focus',keyboardFocus&&keyIndex===i);
  }
  digits('mine-counter',game.remaining);digits('timer',elapsed);setFace();
  windowEl.classList.toggle('monochrome',!settings.color);
}
// Classic WinMine keeps timing through menus, dialogs, and loss of focus.
function clockBlocked(){return windowEl.hidden;}
function resetClock(){clearInterval(clock);clock=null;elapsed=0;pauseAt=null;}
function beginClock(){
  if(clock)return;
  elapsed=1;lastTick=performance.now();
  pauseAt=clockBlocked()?lastTick:null;
  clock=setInterval(()=>{
    if(!['ready','playing'].includes(game.state)||pauseAt!==null||clockBlocked())return;
    const now=performance.now();const seconds=Math.floor((now-lastTick)/1000);
    if(seconds>0){elapsed=Math.min(999,elapsed+seconds);lastTick+=seconds*1000;digits('timer',elapsed);}
  },100);
}
function pauseClock(){if(clock&&clockBlocked()&&pauseAt===null)pauseAt=performance.now();}
function resumeClock(){if(!clockBlocked()&&pauseAt!==null){lastTick+=performance.now()-pauseAt;pauseAt=null;}}
function newGame(options={}){
  clearTimeout(recordPromptTimer);recordPromptTimer=null;pendingRecord=null;
  closeMenu();resetClock();clearGesture();
  let config=settings.difficulty==='custom'?settings.custom:presets[settings.difficulty];
  game=new Minefield(config);keyIndex=0;keyboardFocus=false;
  board.style.setProperty('--cols',game.cols);board.style.setProperty('--rows',game.rows);
  board.setAttribute('aria-rowcount',game.rows);board.setAttribute('aria-colcount',game.cols);
  board.replaceChildren(...game.cells.map((_,i)=>{const node=document.createElement('button');node.className='cell';node.tabIndex=-1;node.dataset.index=i;node.setAttribute('role','gridcell');return node;}));
  $('announcement').textContent=`New ${settings.difficulty} game. ${game.rows} rows, ${game.cols} columns, ${game.mines} mines.`;
  applyScale();render();persist();
  if(options.silent!==true)sound.play('new');
}
function applyScale(){
  document.documentElement.style.setProperty('--scale',settings.scale);
  const width=game.cols*16+26,height=game.rows*16+107;
  $('desktop').style.minWidth=`${width*settings.scale+24}px`;
  $('desktop').style.minHeight=`max(100dvh,${height*settings.scale+24}px)`;
}
function act(action,index){
  const before=game.state,revealedBefore=game.revealedCount;const changed=action==='reveal'?game.reveal(index):action==='chord'?game.chord(index):game.mark(index,settings.marks);
  // Even a left click on a flag or an initial chord starts the original clock.
  if(before==='ready'&&action!=='mark'&&Number.isInteger(index)&&index>=0&&index<game.cells.length)beginClock();
  if(!changed)return render();
  sound.play(game.state==='lost'?'loss':game.state==='won'?'win':action==='mark'?(game.cells[index].mark===1?'flag':'unmark'):game.revealedCount-revealedBefore>1?'flood':'reveal');
  if(game.state==='lost'||game.state==='won'){
    clearInterval(clock);clock=null;
    $('announcement').textContent=game.state==='won'?`You won in ${elapsed} seconds!`:'Game over. Select the face or press F2 to play again.';
    if(game.state==='won'&&settings.difficulty!=='custom'&&elapsed<records[settings.difficulty].time){
      pendingRecord={game,difficulty:settings.difficulty,time:elapsed};
      recordPromptTimer=setTimeout(()=>{recordPromptTimer=null;tryRecordPrompt();},150);
    }
  }
  render();
}
function indexAtEvent(event){const element=document.elementFromPoint(event.clientX,event.clientY)?.closest('.cell');return element&&board.contains(element)?Number(element.dataset.index):-1;}
function clearGesture(){mouseButtons=0;hoverIndex=-1;isChording=false;suppressUntilRelease=false;touch=null;clearTimeout(longPress);}
board.addEventListener('contextmenu',e=>e.preventDefault());
board.addEventListener('mousedown',event=>{
  if(activeDialog||event.button>2)return;event.preventDefault();closeMenu();keyboardFocus=false;board.focus({preventScroll:true});
  const index=indexAtEvent(event);if(index<0)return;
  mouseButtons=event.buttons;hoverIndex=index;
  if(event.button===1||(event.buttons&3)===3){isChording=true;suppressUntilRelease=false;}
  else if(event.button===2&&!isChording){act('mark',index);}
  render();
});
document.addEventListener('mousemove',event=>{if(!mouseButtons)return;hoverIndex=indexAtEvent(event);render();});
document.addEventListener('mouseup',event=>{
  if(!mouseButtons)return;
  const index=indexAtEvent(event),chord=isChording;
  const shouldAct=!suppressUntilRelease&&(event.button===0||event.button===1||chord);
  mouseButtons=event.buttons;hoverIndex=index;
  if(chord){isChording=false;suppressUntilRelease=true;}
  if(shouldAct&&index>=0)act(chord?'chord':'reveal',index);
  if(!event.buttons)clearGesture();render();
});
window.addEventListener('blur',()=>{clearGesture();faceDown=false;pauseClock();render();});
window.addEventListener('focus',()=>{if(!menu&&!activeDialog&&!windowEl.hidden)resumeClock();});
document.addEventListener('visibilitychange',()=>{document.hidden?pauseClock():resumeClock();});
board.addEventListener('touchstart',event=>{
  event.preventDefault();closeMenu();if(event.touches.length!==1){clearGesture();render();return;}
  const point=event.touches[0],index=indexAtEvent(point);if(index<0)return;
  touch={index,x:point.clientX,y:point.clientY,moved:false,marked:false};mouseButtons=1;hoverIndex=index;render();
  longPress=setTimeout(()=>{if(!touch||touch.moved)return;touch.marked=true;mouseButtons=0;act('mark',index);navigator.vibrate?.(20);},450);
},{passive:false});
board.addEventListener('touchmove',event=>{event.preventDefault();if(!touch)return;const p=event.touches[0];if(Math.hypot(p.clientX-touch.x,p.clientY-touch.y)>8){touch.moved=true;clearTimeout(longPress);hoverIndex=-1;render();}},{passive:false});
board.addEventListener('touchend',event=>{event.preventDefault();if(!touch)return;const {index,moved,marked}=touch;clearGesture();if(!moved&&!marked)act(game.cells[index].revealed?'chord':'reveal',index);render();},{passive:false});
board.addEventListener('touchcancel',()=>{clearGesture();render();});
board.addEventListener('keydown',event=>{
  if(activeDialog||menu)return;
  const moves={ArrowLeft:-1,ArrowRight:1,ArrowUp:-game.cols,ArrowDown:game.cols};
  if(event.key in moves){event.preventDefault();keyIndex=Math.max(0,Math.min(game.cells.length-1,keyIndex+moves[event.key]));keyboardFocus=true;render();}
  else if(event.key===' '||event.key==='Enter'){event.preventDefault();keyboardFocus=true;act(event.shiftKey||game.cells[keyIndex].revealed?'chord':'reveal',keyIndex);}
  else if(event.key.toLowerCase()==='f'){event.preventDefault();keyboardFocus=true;act('mark',keyIndex);}
});
$('face').addEventListener('pointerdown',()=>{faceDown=true;setFace();});
document.addEventListener('pointerup',()=>{if(faceDown){faceDown=false;setFace();}});
$('face').addEventListener('click',newGame);

const gameMenu=[
  ['New','new','F2'],null,
  ['Beginner','beginner'],['Intermediate','intermediate'],['Expert','expert'],['Custom...','custom'],null,
  ['Marks (?)','marks'],['Color','color'],['Sound','sound'],null,['Best Times...','records'],null,['Exit','exit']
];
const helpMenu=[['Help Topics','topics','F1'],null,['About Minesweeper','about']];
function populateMenu(kind){
  const node=$(kind+'-menu');node.replaceChildren();
  for(const entry of kind==='game'?gameMenu:helpMenu){
    if(!entry){const hr=document.createElement('div');hr.className='separator';hr.setAttribute('role','separator');node.append(hr);continue;}
    const [label,id,shortcut]=entry,button=document.createElement('button');button.role='menuitem';button.dataset.action=id;
    const checked=settings.difficulty===id||(id==='marks'&&settings.marks)||(id==='color'&&settings.color)||(id==='sound'&&settings.sound);
    if(['beginner','intermediate','expert','custom','marks','color','sound'].includes(id)){button.role='menuitemcheckbox';button.setAttribute('aria-checked',checked);}
    if(checked){const check=document.createElement('span');check.className='check';check.textContent='✓';button.append(check);}
    button.append(document.createTextNode(label));if(shortcut){const span=document.createElement('span');span.className='shortcut';span.textContent=shortcut;button.append(span);}
    button.addEventListener('click',()=>{closeMenu();menuAction(id);});node.append(button);
  }
}
function openMenu(kind,focus=false){
  if(activeDialog)return;if(menu===kind){closeMenu();return;}closeMenu(false);menu=kind;pauseClock();populateMenu(kind);
  $(kind+'-menu').hidden=false;$(kind+'-menu-button').setAttribute('aria-expanded','true');
  if(focus)$(kind+'-menu').querySelector('button').focus();
}
function closeMenu(resume=true){
  if(menu){$(menu+'-menu').hidden=true;$(menu+'-menu-button').setAttribute('aria-expanded','false');menu=null;}
  if(resume&&!activeDialog&&!windowEl.hidden)resumeClock();
}
for(const kind of ['game','help']){
  $(kind+'-menu-button').addEventListener('click',()=>openMenu(kind));
  $(kind+'-menu-button').addEventListener('mouseenter',()=>{if(menu&&menu!==kind)openMenu(kind);});
}
document.addEventListener('mousedown',e=>{if(!e.target.closest('.menu-bar'))closeMenu();});
function menuAction(id){
  if(id==='new')newGame();
  else if(presets[id]){settings.difficulty=id;newGame();}
  else if(id==='custom')showCustom();
  else if(id==='marks'||id==='color'){settings[id]=!settings[id];persist();render();}
  else if(id==='sound'){settings.sound=!settings.sound;sound.setEnabled(settings.sound);if(settings.sound)sound.unlock();persist();}
  else if(id==='records')showRecords();else if(id==='topics')showHelp();else if(id==='about')showAbout();else if(id==='exit')closeWindow();
}
document.addEventListener('keydown',event=>{
  if(event.key==='Alt')document.body.classList.add('keyboard-nav');
  if(event.key==='F2'&&!activeDialog){event.preventDefault();restoreWindow();newGame();}
  if(event.key==='F1'){event.preventDefault();if(!activeDialog)showHelp();}
  if(event.altKey&&['g','h'].includes(event.key.toLowerCase())){event.preventDefault();openMenu(event.key.toLowerCase()==='g'?'game':'help',true);}
  if(activeDialog){
    if(event.key==='Escape'){event.preventDefault();closeDialog();}
    if(event.key==='Tab'){const nodes=[...$('modal-layer').querySelectorAll('button,input,select,a[href]')];const index=nodes.indexOf(document.activeElement);if(event.shiftKey&&index<=0){event.preventDefault();nodes.at(-1)?.focus();}else if(!event.shiftKey&&index===nodes.length-1){event.preventDefault();nodes[0]?.focus();}}
    return;
  }
  if(menu){
    const buttons=[...$(menu+'-menu').querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[index<0?(event.key==='ArrowDown'?0:buttons.length-1):(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}
    else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();openMenu(menu==='game'?'help':'game',true);}
    else if(event.key==='Escape'){event.preventDefault();closeMenu();board.focus();}
  }
});
document.addEventListener('keyup',event=>{if(event.key==='Alt')document.body.classList.remove('keyboard-nav');});

function showDialog(title,html,onReady,options={}){
  closeMenu(false);pauseClock();lastFocus=document.activeElement;
  activeDialog={onClose:options.onClose};
  $('modal-layer').innerHTML=`<section class="window dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header class="title-bar"><span class="title-text" id="dialog-title"></span><button class="caption-button close" aria-label="Close dialog"><span class="close-icon"></span></button></header><div class="dialog-body">${html}</div></section>`;
  $('dialog-title').textContent=title;$('modal-layer').hidden=false;
  $('modal-layer').querySelector('.caption-button').onclick=()=>closeDialog();
  onReady?.($('modal-layer'));
  ($('modal-layer').querySelector('[autofocus]')||$('modal-layer').querySelector('.default')||$('modal-layer').querySelector('button'))?.focus();
}
function closeDialog(){
  if(!activeDialog)return;
  const callback=activeDialog.onClose;activeDialog=null;$('modal-layer').hidden=true;$('modal-layer').replaceChildren();
  callback?.();resumeClock();lastFocus?.isConnected&&lastFocus.focus({preventScroll:true});
  if(recordPromptTimer===null)tryRecordPrompt();
}
const actions=(ok='OK',cancel=false)=>`<div class="dialog-actions"><button class="classic-button default" data-dialog="ok">${ok}</button>${cancel?'<button class="classic-button" data-dialog="cancel">Cancel</button>':''}</div>`;
function showCustom(){
  showDialog('Custom Field',`<form id="custom-form" novalidate><div class="custom-layout"><label for="custom-height">Height:</label><input class="classic-input" type="number" id="custom-height" name="height" min="9" max="24" value="${game.rows}" autofocus><label for="custom-width">Width:</label><input class="classic-input" type="number" id="custom-width" min="9" max="30" value="${game.cols}"><label for="custom-mines">Mines:</label><input class="classic-input" type="number" id="custom-mines" min="10" max="667" value="${game.mines}"></div>${actions('OK',true)}</form>`,layer=>{
    const apply=event=>{event.preventDefault();const clamp=(id,min,max)=>Math.max(min,Math.min(max,Math.trunc(Number($(id).value)||min)));const rows=clamp('custom-height',9,24),cols=clamp('custom-width',9,30),mines=clamp('custom-mines',10,(rows-1)*(cols-1));settings.custom={rows,cols,mines};settings.difficulty='custom';closeDialog();};
    layer.querySelector('form').addEventListener('submit',apply);layer.querySelector('[data-dialog=ok]').type='submit';
    layer.querySelector('[data-dialog=cancel]').type='button';layer.querySelector('[data-dialog=cancel]').onclick=()=>closeDialog();
    $('custom-height').select();
  },{onClose:newGame});
}
function showRecords(){
  showDialog('Fastest Mine Sweepers',`<table class="records"><tbody>${['beginner','intermediate','expert'].map(id=>`<tr><td>${id[0].toUpperCase()+id.slice(1)}:</td><td>${records[id].time} seconds</td><td data-record="${id}"></td></tr>`).join('')}</tbody></table><div class="dialog-actions"><button class="classic-button" id="reset-records">Reset Scores</button><button class="classic-button default" data-dialog="ok">OK</button></div>`,layer=>{
    for(const id of ['beginner','intermediate','expert'])layer.querySelector(`[data-record=${id}]`).textContent=records[id].name;
    layer.querySelector('[data-dialog=ok]').onclick=()=>closeDialog();
    $('reset-records').onclick=()=>{for(const id of ['beginner','intermediate','expert'])records[id]={time:999,name:'Anonymous'};persist();closeDialog();showRecords();};
  });
}
function tryRecordPrompt(){
  if(!pendingRecord)return;
  if(pendingRecord.game!==game||game.state!=='won'){pendingRecord=null;return;}
  if(activeDialog)return;
  const {difficulty,time}=pendingRecord;pendingRecord=null;showRecordEntry(difficulty,time);
}
function showRecordEntry(difficulty,time){
  if(game.state!=='won')return;
  let name='Anonymous';
  showDialog('New Best Time!',`<form><p>You have the fastest time<br>for ${difficulty} level.<br>Please enter your name.</p><input class="classic-input" aria-label="Your name" id="player-name" value="Anonymous" maxlength="31" autofocus>${actions()}</form>`,layer=>{
    $('player-name').select();layer.querySelector('form').onsubmit=event=>{event.preventDefault();name=$('player-name').value.trim()||'Anonymous';closeDialog();showRecords();};
    layer.querySelector('[data-dialog=ok]').type='submit';
  },{onClose:()=>{records[difficulty]={time,name};persist();}});
}
function showHelp(){
  showDialog('Minesweeper Help',`<div class="help-content"><h2>How to play Minesweeper</h2><p>Find every safe square without uncovering a mine. A number tells you how many mines touch that square.</p><p><b>Left click</b> — uncover a square.<br><b>Right click</b> — flag → ? → unmarked.<br><b>Both buttons / middle click</b> — uncover the surrounding squares when the number of flags matches.<br><b>F2</b> — start a new game.</p><p><b>Game → Sound</b> turns the original retro sound effects on or off.</p><p>Touch: tap to uncover, hold to flag. Tap an open number to uncover its neighbors.<br>Keyboard: arrow keys, Space to uncover, F to flag, Shift + Space for neighbors.</p><hr><div class="setting-row"><label for="pixel-scale">Pixel size:</label><select id="pixel-scale"><option value="1">1× (original)</option><option value="2">2×</option><option value="3">3×</option></select></div></div>${actions()}`,layer=>{
    $('pixel-scale').value=settings.scale;$('pixel-scale').onchange=()=>{settings.scale=Number($('pixel-scale').value);applyScale();persist();};
    layer.querySelector('[data-dialog=ok]').onclick=()=>closeDialog();
  });
}
function showAbout(){
  showDialog('About Minesweeper',`<div class="help-content"><div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><img class="about-icon" src="assets/minesweeper.ico" width="32" height="32" alt=""><div><b>Minesweeper</b><br>Windows 2000 recreation</div></div><p>© 2026 Kyumin Nam<br><a href="https://opensource.org/license/mit" target="_blank" rel="noopener">MIT License</a></p><hr><p>Graphics © Microsoft<br>Sources: <a href="https://github.com/CobaltXII/Minesweeper" target="_blank" rel="noopener">CobaltXII</a> · <a href="https://github.com/wildptr/winmine/tree/master/data" target="_blank" rel="noopener">wildptr</a><br>Sprite rips: Black Squirrel &amp; Emmett N.<br>Fonts: <a href="https://github.com/jdan/98.css" target="_blank" rel="noopener">98.css</a></p></div>${actions()}`,layer=>{layer.querySelector('[data-dialog=ok]').onclick=()=>closeDialog();});
}
function minimize(){clearGesture();windowEl.hidden=true;pauseClock();$('restore-window').hidden=false;}
function closeWindow(){clearGesture();windowEl.hidden=true;pauseClock();$('restore-window').hidden=true;$('reopen').hidden=false;}
function restoreWindow(){windowEl.hidden=false;$('restore-window').hidden=true;$('reopen').hidden=true;resumeClock();}
$('minimize').onclick=minimize;$('close-window').onclick=closeWindow;$('restore-window').onclick=restoreWindow;$('reopen').onclick=restoreWindow;
let drag=null;
$('title-bar').addEventListener('pointerdown',event=>{
  if(event.target.closest('button')||event.button!==0)return;
  const rect=windowEl.getBoundingClientRect();drag={x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
  $('title-bar').setPointerCapture(event.pointerId);
});
$('title-bar').addEventListener('pointermove',event=>{
  if(!drag)return;const width=windowEl.offsetWidth,height=windowEl.offsetHeight;
  const left=Math.max(-width+60,Math.min(innerWidth-60,drag.left+event.clientX-drag.x));const top=Math.max(0,Math.min(innerHeight-22,drag.top+event.clientY-drag.y));
  windowEl.style.position='fixed';windowEl.style.left=`${left-(width-width*settings.scale)/2}px`;windowEl.style.top=`${top-(height-height*settings.scale)/2}px`;
});
$('title-bar').addEventListener('pointerup',()=>{drag=null;});
$('title-bar').addEventListener('pointercancel',()=>{drag=null;});
newGame({silent:true});
