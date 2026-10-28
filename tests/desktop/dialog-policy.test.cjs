'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validDialogSnapshot,validDialogAction,validDialogSize}=require('../../electron/dialog-policy.cjs');
const field={id:'n1',value:'16',checked:false};
const snapshot={token:1,title:'Custom Field',html:'<section class="window dialog"></section>',fields:[field]};
test('dialog snapshots accept bounded copied content and live form fields',()=>{
  assert.equal(validDialogSnapshot(snapshot),true);
  assert.equal(validDialogSnapshot({...snapshot,token:2147483647,fields:[{id:'n999',value:'x'.repeat(4096),checked:true}]}),true);
  for(const value of [null,{}, {...snapshot,token:0},{...snapshot,token:1.5},{...snapshot,token:2147483648},{...snapshot,title:'x'.repeat(257)},{...snapshot,html:'x'.repeat(65537)},{...snapshot,fields:Array(65).fill(field)},{...snapshot,fields:[{...field,id:'n1000'}]},{...snapshot,fields:[{...field,id:'input'}]},{...snapshot,fields:[{...field,value:'x'.repeat(4097)}]},{...snapshot,fields:[{...field,checked:'false'}]}])assert.equal(validDialogSnapshot(value),false);
});
test('dialog actions allow only bounded UI commands and a distinct close command',()=>{
  for(const kind of ['click','change','submit'])assert.equal(validDialogAction({token:1,kind,id:'n0',fields:[field]}),true);
  assert.equal(validDialogAction({token:1,kind:'close',id:'',fields:[]}),true);
  for(const value of [null,{token:0,kind:'close',id:'',fields:[]},{token:1,kind:'eval',id:'n0',fields:[]},{token:1,kind:'click',id:'',fields:[]},{token:1,kind:'close',id:'n0',fields:[]},{token:1,kind:'click',id:'#button',fields:[]},{token:1,kind:'click',id:'n0',fields:[{...field,value:42}]}])assert.equal(validDialogAction(value),false);
});
test('dialog measurements accept content sizes and reject unsafe dimensions',()=>{
  for(const value of [{token:1,width:120,height:50},{token:1,width:1600,height:1600}])assert.equal(validDialogSize(value),true);
  for(const value of [null,{}, {token:0,width:300,height:200},{token:1,width:119,height:200},{token:1,width:1601,height:200},{token:1,width:300,height:49},{token:1,width:300,height:1601},{token:1,width:300.5,height:200},{token:1,width:300,height:Infinity},{token:1,width:'300',height:200}])assert.equal(validDialogSize(value),false);
});
