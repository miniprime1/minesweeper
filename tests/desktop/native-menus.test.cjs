const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {NativeMenus, MENU_URL, validMenu, menuBounds} = require('../../electron/native-menus.cjs');
const snapshot = (token = 1) => ({token, kind: 'help', anchor: {x: 43, y: 40, above: 21}, size: {width: 160, height: 54},
  selected: '', items: [{id: 'topics', label: 'Help Topics', shortcut: 'F1', checked: false, checkable: false}, null,
    {id: 'about', label: 'About Minesweeper', shortcut: '', checked: false, checkable: false}]});
class FakeWindow extends EventEmitter {
  constructor(options) {
    super(); this.options = options; this.destroyed = false; this.messages = []; this.shown = 0;
    this.webContents = new EventEmitter(); this.webContents.mainFrame = {url: MENU_URL};
    this.webContents.setWindowOpenHandler = fn => { this.openHandler = fn; };
    this.webContents.send = (...args) => this.messages.push(args);
    this.webContents.setZoomFactor = scale => { this.zoom = scale; };
  }
  setMenuBarVisibility() {}
  loadURL(url) { this.url = url; return Promise.resolve(); }
  setBounds(bounds) { this.bounds = bounds; }
  showInactive() { this.shown++; }
  isDestroyed() { return this.destroyed; }
  destroy() { this.destroyed = true; this.emit('closed'); }
}
function setup(Window = FakeWindow) {
  const sent = [], owner = {x: 100, y: 100, width: 680, height: 1004};
  const parent = {getContentBounds: () => ({...owner})};
  const manager = new NativeMenus({BrowserWindow: Window, parent: () => parent, zoom: () => 4,
    screen: {getDisplayMatching: () => ({workArea: {x: 0, y: 0, width: 2000, height: 1400}})},
    sendToParent: value => sent.push(value)});
  return {manager, parent, owner, sent};
}
const eventFor = win => ({sender: win.webContents, senderFrame: win.webContents.mainFrame});

test('oversized menu at 400% floats outside the beginner window without resizing the owner', () => {
  const {manager, parent, owner} = setup(); const original = {...owner};
  assert.equal(manager.update(snapshot()), true);
  const child = manager.window; manager.handleReady(eventFor(child));
  assert.equal(child.options.parent, parent);
  assert.equal(child.options.focusable, false); assert.equal(child.options.skipTaskbar, true);
  assert.equal(child.options.webPreferences.sandbox, true); assert.equal(child.options.webPreferences.nodeIntegration, false);
  assert.deepEqual(child.bounds, {x: 272, y: 260, width: 640, height: 216});
  assert.ok(child.bounds.x + child.bounds.width > owner.x + owner.width);
  assert.deepEqual(owner, original); assert.equal(child.zoom, 4);
  owner.x = 200; manager.reposition(); assert.equal(child.bounds.x, 372);
  manager.close(); assert.equal(child.destroyed, true);
});
test('menus fit all display edges and zoom levels, including monitors left of the primary display', () => {
  for (const zoom of [0.75, 1, 2, 4]) {
    const area = {x: -1280, y: 40, width: 1280, height: 760};
    const {bounds} = menuBounds(snapshot(), {x: -100, y: 720}, zoom, area);
    assert.ok(bounds.x >= area.x && bounds.x + bounds.width <= area.x + area.width);
    assert.ok(bounds.y >= area.y && bounds.y + bounds.height <= area.y + area.height);
    if (720 + (40 + 54) * zoom > area.y + area.height)
      assert.ok(bounds.y + bounds.height <= Math.round(720 + 21 * zoom), 'bottom overflow opens above the menu bar');
  }
  const large = {...snapshot(), size: {width: 400, height: 900}};
  const {scale, bounds} = menuBounds(large, {x: 0, y: 0}, 4, {x: 0, y: 0, width: 800, height: 600});
  assert.equal(scale, 600 / 900); assert.equal(bounds.height, 600);
  const tall = {...snapshot(), size: {width: 172, height: 238}};
  const nearBottom = menuBounds(tall, {x: 100, y: 220}, 4, {x: 0, y: 24, width: 1920, height: 1212});
  assert.equal(nearBottom.bounds.y, 284, 'when neither side fits, shift only enough to keep the menu on screen');
});
test('only the current popup and its live menu actions can reach the game', () => {
  const {manager, sent} = setup(); manager.update(snapshot()); const win = manager.window, event = eventFor(win);
  const action = {token: 1, kind: 'activate', id: 'about'};
  for (const value of [{...action, token: 2}, {...action, id: 'exit'}, {...action, kind: 'execute'}]) assert.equal(manager.handleAction(event, value), false);
  assert.equal(manager.handleAction({...event, senderFrame: {url: MENU_URL}}, action), false);
  assert.equal(manager.handleAction(event, {...action, kind: 'hover'}), true); assert.equal(win.destroyed, false);
  assert.equal(manager.handleAction(event, action), true); assert.equal(win.destroyed, true);
  assert.equal(manager.handleAction(event, action), false); assert.equal(sent.length, 2);
});
test('dismissal and failed popup loads close once, while stale events cannot close a replacement', async () => {
  const {manager, sent} = setup(); manager.update(snapshot()); const old = manager.window;
  manager.update(snapshot(2)); assert.equal(manager.window, old);
  manager.dismiss(); manager.dismiss(); assert.deepEqual(sent, [{token: 2, kind: 'dismiss'}]);
  manager.update(snapshot(3)); old.webContents.emit('render-process-gone'); assert.ok(manager.window);
  manager.window.webContents.emit('render-process-gone'); assert.equal(manager.window, null);
  assert.deepEqual(sent.at(-1), {token: 3, kind: 'dismiss'});
  class Failed extends FakeWindow { loadURL() { return Promise.reject(new Error('missing page')); } }
  const broken = setup(Failed); broken.manager.update(snapshot()); await Promise.resolve();
  assert.equal(broken.manager.window, null); assert.equal(broken.sent.length, 1);
});
test('menu snapshots reject malformed geometry, markup substitutes, and commands from a different menu', () => {
  const good = snapshot(); assert.equal(validMenu(good), true);
  for (const bad of [null, {...good, token: -1}, {...good, kind: '__proto__'}, {...good, selected: 'exit'},
    {...good, anchor: {...good.anchor, x: NaN}}, {...good, size: {width: Infinity, height: 50}},
    {...good, items: [{...good.items[0], id: 'exit'}]}, {...good, items: '<script>bad()</script>'}]) assert.equal(validMenu(bad), false);
});
