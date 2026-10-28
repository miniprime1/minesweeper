import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Minefield, presets } from '../../src/engine.js';
import { SoundEffects } from '../../src/sound.js';

const source = readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8').replace(/^import .*?;\n/gm, '');

// Exercise application events and time without a browser or external dependencies.
function application(saved = '{}') {
  let now = 0, nextTimer = 1;
  const intervals = new Map(), timeouts = new Map(), elements = new Map();
  const eventTarget = () => ({
    listeners: new Map(),
    addEventListener(name, callback) {
      if (!this.listeners.has(name)) this.listeners.set(name, []);
      this.listeners.get(name).push(callback);
    },
    emit(name, event = {}) {
      event.preventDefault ??= () => {};
      for (const callback of this.listeners.get(name) || []) callback(event);
    },
  });
  const document = eventTarget();
  function element(tag = 'div') {
    const classes = new Set();
    const node = Object.assign(eventTarget(), {
      tagName: tag, children: [], dataset: {}, attributes: {}, hidden: false,
      style: { setProperty(name, value) { this[name] = value; } },
      classList: {
        add(name) { classes.add(name); }, remove(name) { classes.delete(name); },
        toggle(name, value) { value ? classes.add(name) : classes.delete(name); },
      },
      setAttribute(name, value) { this.attributes[name] = value; },
      append(...nodes) { for (const child of nodes) child.parentElement = this; this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = []; this.append(...nodes); },
      contains(other) { return this === other || this.children.some(child => child.contains?.(other)); },
      closest(selector) {
        return selector.startsWith('.') && this.className?.split(' ').includes(selector.slice(1)) ? this : this.parentElement?.closest?.(selector);
      },
      focus() { document.activeElement = this; },
      querySelectorAll(selector) {
        return this.children.flatMap(child => [
          ...(selector === 'button' && child.tagName === 'button' ? [child] : []),
          ...(child.querySelectorAll?.(selector) || []),
        ]);
      },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      isConnected: true,
    });
    return node;
  }
  document.createElement = element;
  document.createTextNode = text => ({ textContent: text });
  document.getElementById = id => {
    if (!elements.has(id)) elements.set(id, element(id === 'board' ? 'div' : 'button'));
    return elements.get(id);
  };
  document.documentElement = element(); document.body = element();
  document.hidden = false;
  document.elementFromPoint = index => document.getElementById('board').children[index];
  const context = vm.createContext({
    Minefield, presets, SoundEffects, document, window: eventTarget(), navigator: {},
    localStorage: { getItem: () => saved, setItem(key, value) { context.persisted.push(JSON.parse(value)); } },
    performance: { now: () => now }, innerWidth: 1024, innerHeight: 768,
    setInterval: fn => { const id = nextTimer++; intervals.set(id, fn); return id; },
    clearInterval: id => intervals.delete(id),
    setTimeout: (fn, delay) => { const id = nextTimer++; timeouts.set(id, { fn, due: now + delay }); return id; },
    clearTimeout: id => timeouts.delete(id),
    dialogLog: [], soundLog: [], persisted: [],
  });
  const run = code => vm.runInContext(code, context);
  run(source);
  run("const originalPlay=sound.play.bind(sound); sound.play=kind=>{if(sound.enabled)soundLog.push(kind);return originalPlay(kind);};");
  // Modal rendering is outside this harness; preserve its actual lifecycle state.
  run('showDialog = (title, html, onReady, options = {}) => { activeDialog = { onClose: options.onClose }; dialogLog.push(title); };');
  return {
    run, document, elements, context,
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timeouts]) if (timer.due <= now) { timeouts.delete(id); timer.fn(); }
      for (const fn of [...intervals.values()]) fn();
    },
    useKnownBoard() { run("game = new Minefield({rows:3,cols:3,mines:1}, () => 0.999); act('reveal',4);"); },
    win() { run("for (let i=0;i<game.cells.length;i++) if(!game.cells[i].mine) act('reveal',i);"); },
  };
}

test('malformed saved data cannot prevent startup or create missing records', () => {
  for (const saved of ['null', '[]', '{', '{"settings":{"difficulty":"custom","custom":{"rows":9,"cols":9},"scale":99},"records":{"beginner":{"time":"bad"}}}']) {
    const app = application(saved);
    assert.equal(app.run('game.cells.length > game.mines'), true);
    assert.equal(app.run('records.expert.time'), 999);
    assert.equal(app.run('settings.scale'), 1);
  }
});

test('desktop progress counts safe reveals through flags, wins, losses, and new games',()=>{
  const app=application(),board=app.elements.get('board');
  assert.equal(board.attributes['data-game-state'],'ready');
  assert.equal(board.attributes['data-safe-total'],'216');
  app.run("act('mark',4)");assert.equal(board.attributes['data-revealed'],'0');
  app.useKnownBoard();assert.equal(board.attributes['data-game-state'],'playing');
  assert.equal(board.attributes['data-safe-total'],'8');assert.equal(board.attributes['data-revealed'],'1');
  app.win();assert.equal(board.attributes['data-game-state'],'won');assert.equal(board.attributes['data-revealed'],'8');
  app.run('newGame()');assert.equal(board.attributes['data-game-state'],'ready');assert.equal(board.attributes['data-revealed'],'0');
  app.useKnownBoard();app.run("act('reveal',8)");assert.equal(board.attributes['data-game-state'],'lost');assert.equal(board.attributes['data-revealed'],'1');
});

test('the classic clock runs through menus, dialogs, backgrounding, and loss of focus', () => {
  const app = application(); app.useKnownBoard();
  assert.equal(app.run('elapsed'), 1);
  app.advance(1000);
  app.run("openMenu('game')"); app.advance(3000);
  assert.equal(app.run('elapsed'), 5);
  app.run("closeMenu(); showHelp();"); app.advance(2000);
  assert.equal(app.run('elapsed'), 7);
  app.run('closeDialog()'); app.context.window.emit('blur');
  app.document.hidden = true; app.document.emit('visibilitychange'); app.advance(4000);
  assert.equal(app.run('elapsed'), 11);
});

test('minimizing pauses without catch-up and the clock caps at 999', () => {
  const app = application(); app.useKnownBoard();
  app.advance(1000); app.run('minimize()'); app.advance(9000);
  assert.equal(app.run('elapsed'), 2);
  app.run('restoreWindow()'); app.advance(1000);
  assert.equal(app.run('elapsed'), 3);
  app.advance(1000000);
  assert.equal(app.run('elapsed'), 999);
});

test('a flag alone leaves the clock idle; releasing left on that flag starts it', () => {
  const app = application();
  app.run("act('mark',4)"); app.advance(1000);
  assert.equal(app.run('elapsed'), 0);
  app.run("act('reveal',4)"); app.advance(1000);
  assert.equal(app.run('elapsed'), 2);
  assert.equal(app.run('game.state'), 'ready');
});

test('a pending best-time prompt is canceled by a new game', () => {
  const app = application(); app.useKnownBoard(); app.win();
  assert.equal(app.run('game.state'), 'won');
  app.run('newGame()'); app.advance(200);
  assert.equal(app.context.dialogLog.length, 0);
});

test('a pending best-time prompt waits for an existing dialog to close', () => {
  const app = application(); app.useKnownBoard(); app.win();
  app.run('showHelp()'); app.advance(200);
  assert.deepEqual([...app.context.dialogLog], ['Minesweeper Help']);
  app.run('closeDialog()');
  assert.deepEqual([...app.context.dialogLog], ['Minesweeper Help', 'New Best Time!']);
});

test('first ArrowUp in a mouse-opened menu selects the last menu item', () => {
  const app = application(); app.run("openMenu('game')");
  app.document.emit('keydown', { key: 'ArrowUp', altKey: false });
  assert.equal(app.document.activeElement.dataset.action, 'exit');
});

test('adding a second touch cancels the pending long-press flag', () => {
  const app = application(), board = app.elements.get('board');
  const point = { clientX: 4, clientY: 0 };
  board.emit('touchstart', { touches: [point] });
  board.emit('touchstart', { touches: [point, point] });
  app.advance(500);
  assert.equal(app.run('game.flags'), 0);
});


test('sound follows actual actions, flags and losses; ignored inputs stay silent', () => {
  const app = application();
  assert.equal(app.context.soundLog.length, 0);
  assert.equal(app.run('sound.context'), null);
  app.run("act('mark',4); act('reveal',4); act('mark',4); act('mark',4); act('reveal',-1)");
  assert.deepEqual([...app.context.soundLog], ['flag', 'unmark', 'unmark']);
  app.context.soundLog.length = 0;
  app.useKnownBoard();
  app.run("act('reveal',4); act('chord',4); act('reveal',8); act('mark',2); act('reveal',1)");
  assert.deepEqual([...app.context.soundLog], ['reveal', 'loss']);
});

test('a flood and a winning chord each emit one cue regardless of opened cells', () => {
  const app = application();
  app.run("game=new Minefield({rows:5,cols:5,mines:5},()=>0.5); game.cells.forEach(c=>c.mine=false); [10,11,12,13,14].forEach(i=>game.cells[i].mine=true); game._countAdjacent(); act('reveal',0)");
  assert.equal(app.run("game.revealedCount > 1 && game.state === 'playing'"), true);
  assert.deepEqual([...app.context.soundLog], ['flood']);
  app.context.soundLog.length = 0;
  app.useKnownBoard();
  app.run("act('mark',8); act('chord',4)");
  assert.equal(app.run('game.state'), 'won');
  assert.deepEqual([...app.context.soundLog], ['reveal', 'flag', 'win']);
});

test('sound preference persists, the menu reflects it, and muted play stays silent', () => {
  const app = application();
  app.run("menuAction('sound'); openMenu('game')");
  const soundItem = app.elements.get('game-menu').children.find(node => node.dataset?.action === 'sound');
  assert.equal(soundItem.role, 'menuitemcheckbox');
  assert.equal(soundItem.attributes['aria-checked'], false);
  app.run("act('mark',1); newGame()");
  assert.equal(app.context.soundLog.length, 0);
  assert.equal(app.context.persisted.at(-1).settings.sound, false);
  app.run("menuAction('sound'); newGame()");
  assert.deepEqual([...app.context.soundLog], ['new']);
  const restored = application('{"settings":{"sound":false}}');
  restored.run("newGame(); act('mark',1)");
  assert.equal(restored.context.soundLog.length, 0);
  assert.equal(restored.run('sound.context'), null);
});
