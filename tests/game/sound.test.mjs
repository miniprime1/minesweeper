import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundEffects } from '../../src/sound.js';

function audioContext({ suspended = false } = {}) {
  const context = { state: suspended ? 'suspended' : 'running', currentTime: 3, sampleRate: 8000, destination: {}, sources: [], gains: [] };
  const parameter = () => ({ value: 1, events: [],
    setValueAtTime(...args) { this.events.push(['set', ...args]); },
    linearRampToValueAtTime(...args) { this.events.push(['linear', ...args]); },
    exponentialRampToValueAtTime(...args) { this.events.push(['exponential', ...args]); },
    cancelScheduledValues(...args) { this.events.push(['cancel', ...args]); },
  });
  const node = () => ({ connect() {}, disconnect() { this.disconnected = true; } });
  const source = () => {
    const value = { ...node(), frequency: parameter(), starts: [], stops: [], start(time) { this.starts.push(time); }, stop(time) { this.stops.push(time); } };
    context.sources.push(value); return value;
  };
  context.createGain = () => { const gain = { ...node(), gain: parameter() }; context.gains.push(gain); return gain; };
  context.createOscillator = source;
  context.createBufferSource = source;
  context.createBuffer = (_, size) => ({ getChannelData: () => new Float32Array(size) });
  context.createBiquadFilter = () => ({ ...node(), frequency: parameter() });
  let finishResume;
  context.resume = () => new Promise(resolve => { finishResume = () => { context.state = 'running'; resolve(); }; });
  context.finishResume = () => finishResume();
  return context;
}

test('audio is lazy, every cue has bounded envelopes, and sources clean up', () => {
  const context = audioContext(); let created = 0;
  const sound = new SoundEffects({ contextFactory: () => { created += 1; return context; } });
  assert.equal(created, 0);
  sound.unlock();
  assert.equal(created, 1);
  assert.equal(context.sources.length, 0);
  for (const cue of ['reveal', 'flood', 'flag', 'unmark', 'new', 'win', 'loss']) sound.play(cue);
  assert.ok(context.sources.length >= 14);
  assert.equal(context.gains[0].gain.value, 0.18);
  for (const gain of context.gains.slice(1)) {
    const attack = gain.gain.events.find(event => event[0] === 'linear');
    assert.ok(attack[1] > 0 && attack[1] <= 0.6);
  }
  for (const source of context.sources) { assert.equal(source.starts.length, 1); source.onended(); }
  assert.equal(sound.voices.size, 0);
});

test('muting stops every scheduled voice immediately and prevents further audio', () => {
  const context = audioContext(), sound = new SoundEffects({ contextFactory: () => context });
  sound.play('win');
  assert.equal(sound.voices.size, 4);
  sound.setEnabled(false);
  assert.equal(sound.voices.size, 0);
  for (const source of context.sources) assert.equal(source.stops.at(-1), undefined);
  assert.deepEqual(context.gains[0].gain.events.at(-1), ['set', 0, context.currentTime]);
  sound.play('loss');
  assert.equal(context.sources.length, 4);
  sound.setEnabled(true); sound.play('flag');
  assert.equal(context.sources.length, 5);
});

test('muting while unlocking cancels pending audio even if reenabled before resume', async () => {
  const context = audioContext({ suspended: true }), sound = new SoundEffects({ contextFactory: () => context });
  sound.play('win');
  sound.setEnabled(false); sound.setEnabled(true);
  context.finishResume();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.sources.length, 0);
  sound.play('reveal');
  assert.equal(context.sources.length, 1);
});

test('missing, blocked, or denied audio never throws or creates an unhandled rejection', async () => {
  for (const contextFactory of [() => null, () => { throw new Error('Unavailable'); }, () => {
    const context = audioContext({ suspended: true });
    context.resume = () => Promise.reject(new Error('Not allowed'));
    return context;
  }]) {
    const sound = new SoundEffects({ contextFactory });
    assert.doesNotThrow(() => { sound.unlock(); sound.play('loss'); sound.setEnabled(false); });
  }
  await new Promise(resolve => setImmediate(resolve));
});
