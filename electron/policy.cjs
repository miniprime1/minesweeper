'use strict';
const path = require('node:path');
const ORIGIN = 'minesweeper://app';
function trustedURL(value) {
  try {const url = new URL(value);return url.protocol === 'minesweeper:' && url.host === 'app';} catch {return false;}
}
function assetPath(root, requestURL) {
  if (!trustedURL(requestURL)) return null;
  let pathname;
  try {pathname = decodeURIComponent(new URL(requestURL).pathname);} catch {return null;}
  if (pathname.includes('\0') || pathname.includes('\\')) return null;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  return file.startsWith(root + path.sep) ? file : null;
}
function validSize(value) {
  return !!value && Number.isInteger(value.width) && Number.isInteger(value.height) && value.width >= 120 && value.width <= 4096 && value.height >= 180 && value.height <= 4096;
}
function validLayout(value){
  return !!value&&validSize(value.base)&&validSize(value.extent)&&value.base.width<=1024&&value.base.height<=1024&&value.extent.width>=value.base.width&&value.extent.height>=value.base.height&&value.extent.width<=1600&&value.extent.height<=1600;
}
function allowedExternal(value) {
  const sources=new Set(['https://opensource.org/license/mit','https://github.com/CobaltXII/Minesweeper','https://github.com/wildptr/winmine/tree/master/data','https://github.com/jdan/98.css']);
  try {const url = new URL(value);return sources.has(url.origin+url.pathname)&&!url.username&&!url.password&&!url.search;} catch {return false;}
}
module.exports = {ORIGIN, trustedURL, assetPath, validSize, validLayout, allowedExternal};
