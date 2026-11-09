'use strict';
const path = require('node:path');
const MENU_URL = 'minesweeper://app/native-menu.html';
const actions = {
  game: new Set(['new', 'beginner', 'intermediate', 'expert', 'custom', 'marks', 'color', 'sound', 'records', 'exit']),
  help: new Set(['topics', 'about']),
};
const finite = value => typeof value === 'number' && Number.isFinite(value);
function validMenu(value) {
  return !!value && Number.isSafeInteger(value.token) && value.token > 0 && value.token <= 2147483647
    && Object.hasOwn(actions, value.kind)
    && value.anchor && ['x', 'y', 'above'].every(key => finite(value.anchor[key]) && value.anchor[key] >= 0 && value.anchor[key] <= 1024)
    && value.size && ['width', 'height'].every(key => finite(value.size[key]) && value.size[key] >= 1 && value.size[key] <= 1024)
    && Array.isArray(value.items) && value.items.length > 0 && value.items.length <= 20
    && value.items.every(item => item === null || (item && actions[value.kind].has(item.id)
      && typeof item.label === 'string' && item.label.length <= 100
      && typeof item.shortcut === 'string' && item.shortcut.length <= 30
      && typeof item.checked === 'boolean' && typeof item.checkable === 'boolean'))
    && typeof value.selected === 'string' && (value.selected === '' || value.items.some(item => item?.id === value.selected));
}
function menuBounds(snapshot, owner, requestedZoom, area) {
  const scale = Math.min(requestedZoom, area.width / snapshot.size.width, area.height / snapshot.size.height);
  const width = Math.max(1, Math.round(snapshot.size.width * scale));
  const height = Math.max(1, Math.round(snapshot.size.height * scale));
  const left = owner.x + snapshot.anchor.x * requestedZoom;
  let top = owner.y + snapshot.anchor.y * requestedZoom;
  const above = owner.y + snapshot.anchor.above * requestedZoom - height;
  if (top + height > area.y + area.height && above >= area.y) top = above;
  return {scale, bounds: {
    x: Math.round(Math.max(area.x, Math.min(left, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(top, area.y + area.height - height))), width, height,
  }};
}
class NativeMenus {
  constructor({BrowserWindow, screen, parent, zoom, sendToParent}) {
    Object.assign(this, {BrowserWindow, screen, parent, zoom, sendToParent});
    this.window = null; this.snapshot = null; this.ready = false;
  }
  update(value) {
    if (value === null) { this.close(); return true; }
    if (!validMenu(value)) return false;
    this.snapshot = value;
    if (!this.window) this.create();
    else if (this.ready) this.render();
    return true;
  }
  create() {
    const parent = this.parent(); if (!parent) return;
    const win = new this.BrowserWindow({parent, modal: false, show: false, frame: false,
      width: 200, height: 100, useContentSize: true, roundedCorners: false,
      backgroundColor: '#c0c0c0', hasShadow: false, resizable: false, movable: false,
      minimizable: false, maximizable: false, fullscreenable: false,
      focusable: false, skipTaskbar: true, excludedFromShownWindowsMenu: true, title: 'Minesweeper menu',
      webPreferences: {preload: path.join(__dirname, 'menu-preload.cjs'), contextIsolation: true,
        nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false}});
    this.window = win; this.ready = false;
    win.setMenuBarVisibility(false);
    win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    win.webContents.on('will-navigate', (event, url) => { if (url !== MENU_URL) event.preventDefault(); });
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    const fail = () => { if (this.window === win) this.dismiss(); };
    win.webContents.on('did-fail-load', (_event, code) => { if (code !== -3) fail(); });
    win.webContents.on('render-process-gone', fail);
    win.webContents.on('preload-error', fail);
    win.on('closed', fail);
    win.loadURL(MENU_URL).catch(fail);
  }
  trusted(event) {
    const win = this.window;
    return !!win && !win.isDestroyed() && event.sender === win.webContents
      && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url === MENU_URL;
  }
  handleReady(event) { if (this.trusted(event)) { this.ready = true; this.render(); } }
  render() {
    if (!this.window || !this.snapshot || !this.ready) return;
    this.reposition();
    this.window.webContents.send('minesweeper:menu-snapshot', this.snapshot);
    this.window.showInactive();
  }
  reposition() {
    if (!this.window || !this.snapshot || !this.parent()) return;
    const owner = this.parent().getContentBounds();
    const area = this.screen.getDisplayMatching(owner).workArea;
    const {scale, bounds} = menuBounds(this.snapshot, owner, this.zoom(), area);
    this.window.webContents.setZoomFactor(scale);
    this.window.setBounds(bounds, false);
  }
  handleAction(event, value) {
    if (!this.trusted(event) || !value || value.token !== this.snapshot?.token
      || !['activate', 'hover'].includes(value.kind)
      || !this.snapshot.items.some(item => item?.id === value.id)) return false;
    if (value.kind === 'activate') this.close();
    this.sendToParent(value); return true;
  }
  dismiss() {
    const token = this.snapshot?.token;
    this.close();
    if (token) this.sendToParent({token, kind: 'dismiss'});
  }
  close() {
    const win = this.window;
    this.window = null; this.snapshot = null; this.ready = false;
    if (win && !win.isDestroyed()) win.destroy();
  }
}
module.exports = {NativeMenus, MENU_URL, validMenu, menuBounds};
