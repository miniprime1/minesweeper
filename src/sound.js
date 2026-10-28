// Original, short arcade cues generated locally. No downloads or audio files.
const cues = Object.freeze({
  reveal: [[0, 0.035, 880, 660, 'triangle', 0.5]],
  flood: [[0, 0.045, 523, 523, 'square', 0.2], [0.035, 0.045, 659, 659, 'square', 0.2], [0.07, 0.06, 784, 784, 'square', 0.2]],
  flag: [[0, 0.065, 1047, 1568, 'square', 0.22]],
  unmark: [[0, 0.055, 784, 523, 'triangle', 0.5]],
  new: [[0, 0.055, 523, 523, 'square', 0.23], [0.065, 0.08, 784, 784, 'square', 0.23]],
  win: [[0, 0.085, 523, 523, 'square', 0.25], [0.1, 0.085, 659, 659, 'square', 0.25], [0.2, 0.085, 784, 784, 'square', 0.25], [0.3, 0.19, 1047, 1047, 'square', 0.25]],
  loss: [[0, 0.3, 220, 55, 'triangle', 0.55]],
});

export class SoundEffects {
  constructor({ enabled = true, contextFactory = () => {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    return AudioContext ? new AudioContext() : null;
  } } = {}) {
    this.enabled = enabled;
    this.contextFactory = contextFactory;
    this.context = null;
    this.master = null;
    this.voices = new Set();
    this.generation = 0;
    this.resumePromise = null;
  }

  // Called from pointer/keyboard gestures; silent until a game action occurs.
  unlock() {
    if (!this.enabled) return null;
    try {
      if (!this.context) {
        this.context = this.contextFactory();
        if (!this.context) return null;
        this.master = this.context.createGain();
        this.master.gain.value = 0.18;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended' && !this.resumePromise) {
        this.resumePromise = Promise.resolve(this.context.resume()).catch(() => {}).finally(() => { this.resumePromise = null; });
      }
      return this.context;
    } catch {
      return null; // Unsupported/blocked audio never interrupts the game.
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.stop();
    if (this.master) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setValueAtTime(this.enabled ? 0.18 : 0, this.context.currentTime);
    }
  }

  stop() {
    this.generation += 1;
    for (const voice of [...this.voices]) {
      try { voice.source.stop(); } catch {}
      voice.gain.disconnect();
      voice.filter?.disconnect();
      this.voices.delete(voice);
    }
  }

  play(kind) {
    if (!this.enabled || !cues[kind]) return;
    // Starting over cuts off an old victory or loss cue.
    if (kind === 'new') this.stop();
    const context = this.unlock(), generation = this.generation;
    if (!context) return;
    const schedule = () => {
      if (!this.enabled || generation !== this.generation || context.state !== 'running') return;
      try {
        // Bound overlap while rapidly marking a board; the master stays quiet.
        if (this.voices.size > 12) this.stop();
        const start = context.currentTime + 0.004;
        for (const [delay, duration, frequency, endFrequency, type, volume] of cues[kind]) {
          const source = context.createOscillator();
          source.type = type;
          source.frequency.setValueAtTime(frequency, start + delay);
          source.frequency.exponentialRampToValueAtTime(endFrequency, start + delay + duration);
          this.addVoice(source, start + delay, duration, volume);
        }
        if (kind === 'loss') this.noise(start);
      } catch { /* Audio device changes must not affect gameplay. */ }
    };
    if (context.state === 'running') schedule();
    else this.resumePromise?.then(schedule);
  }

  addVoice(source, start, duration, volume, filter = null) {
    const context = this.context, gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(Math.min(0.6, Math.max(0, volume)), start + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    gain.gain.setValueAtTime(0, start + duration + 0.005);
    source.connect(filter || gain);
    filter?.connect(gain);
    gain.connect(this.master);
    const voice = { source, gain, filter };
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect(); gain.disconnect(); filter?.disconnect();
      this.voices.delete(voice);
    };
    source.start(start);
    source.stop(start + duration + 0.01);
  }

  noise(start) {
    const context = this.context, duration = 0.24;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    // Deterministic noise: each little explosion has the same character.
    let seed = 37;
    for (let i = 0; i < samples.length; i += 1) {
      seed = (seed * 16807) % 2147483647;
      samples[i] = (seed / 2147483647) * 2 - 1;
    }
    const source = context.createBufferSource(); source.buffer = buffer;
    const filter = context.createBiquadFilter(); filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, start);
    filter.frequency.exponentialRampToValueAtTime(120, start + duration);
    this.addVoice(source, start, duration, 0.42, filter);
  }
}
