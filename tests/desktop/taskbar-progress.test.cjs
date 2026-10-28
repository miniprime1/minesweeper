'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validProgress,TaskbarProgress}=require('../../electron/taskbar-progress.cjs');
test('only bounded game states and safe-cell counts reach native progress APIs',()=>{
  for(const state of ['ready','playing','lost'])assert.equal(validProgress({state,revealed:0,total:216}),true);
  assert.equal(validProgress({state:'won',revealed:216,total:216}),true);
  for(const value of [null,{}, {state:'unknown',revealed:1,total:10},{state:'playing',revealed:Infinity,total:10},{state:'playing',revealed:1.5,total:10},{state:'playing',revealed:-1,total:10},{state:'playing',revealed:11,total:10},{state:'playing',revealed:1,total:721},{state:'playing',revealed:0,total:0},{state:'ready',revealed:1,total:10},{state:'won',revealed:9,total:10}])assert.equal(validProgress(value),false);
});
test('Dock progress tracks revealed safe cells, survives minimize, and resets after end/new game',()=>{
  const bars=[],menus=[];let destroyed=false;
  const win={isDestroyed:()=>destroyed,setProgressBar:value=>bars.push(value),isMinimized:()=>true};
  const progress=new TaskbarProgress({window:()=>win,dock:{setMenu:menu=>menus.push(menu)},Menu:{buildFromTemplate:template=>template}});
  progress.update({state:'ready',revealed:0,total:10});
  assert.equal(bars.at(-1),-1);
  progress.update({state:'playing',revealed:4,total:10});
  assert.equal(bars.at(-1),.4);
  assert.equal(menus.at(-1)[0].label,'Progress: 40%');
  const count=bars.length;progress.update({state:'playing',revealed:4,total:10});
  assert.equal(bars.length,count,'unchanged hover renders do not repaint the Dock');
  progress.update({state:'lost',revealed:4,total:10});
  assert.equal(bars.at(-1),-1);assert.equal(menus.at(-1)[0].label,'Game over · 40%');
  progress.update({state:'won',revealed:10,total:10});
  assert.equal(bars.at(-1),1);assert.equal(menus.at(-1)[0].label,'Won · 100%');
  progress.update({state:'ready',revealed:0,total:10});assert.equal(bars.at(-1),-1);
  progress.reset();assert.deepEqual(menus.at(-1),[]);
  destroyed=true;assert.equal(progress.update({state:'playing',revealed:1,total:10}),false);
});
test('a nearly completed field never reports 100% before winning',()=>{
  const menus=[];
  const progress=new TaskbarProgress({window:()=>({isDestroyed:()=>false,setProgressBar(){}}),dock:{setMenu:menu=>menus.push(menu)},Menu:{buildFromTemplate:template=>template}});
  progress.update({state:'playing',revealed:709,total:710});
  assert.equal(menus.at(-1)[0].label,'Progress: 99%');
});
