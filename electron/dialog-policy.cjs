'use strict';
const token=value=>Number.isInteger(value)&&value>0&&value<=2147483647;
const id=value=>typeof value==='string'&&/^n\d{1,3}$/.test(value);
function fields(value){return Array.isArray(value)&&value.length<=64&&value.every(field=>field&&id(field.id)&&typeof field.value==='string'&&field.value.length<=4096&&typeof field.checked==='boolean');}
function validDialogSnapshot(value){return !!value&&token(value.token)&&typeof value.title==='string'&&value.title.length<=256&&typeof value.html==='string'&&value.html.length<=65536&&fields(value.fields);}
function validDialogAction(value){return !!value&&token(value.token)&&['click','change','submit','close'].includes(value.kind)&&(value.kind==='close'?value.id==='':id(value.id))&&fields(value.fields);}
function validDialogSize(value){return !!value&&token(value.token)&&Number.isInteger(value.width)&&Number.isInteger(value.height)&&value.width>=120&&value.width<=1600&&value.height>=50&&value.height<=1600;}
module.exports={validDialogSnapshot,validDialogAction,validDialogSize};
