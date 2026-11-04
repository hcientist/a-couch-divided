// Tiny synthesized sound effects. Each player's sounds are panned toward their half of the screen.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.solo = false;
    this.last = {};
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.4;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, len);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  pan(i) {
    return this.solo || i == null ? 0 : i === 0 ? -0.6 : 0.6;
  }

  out(pan) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.master);
    return p;
  }

  throttled(key, ms) {
    const now = performance.now();
    if (this.last[key] && now - this.last[key] < ms) return true;
    this.last[key] = now;
    return false;
  }

  tone({ f = 440, f2 = f, dur = 0.1, type = 'square', vol = 0.1, pan = 0, delay = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.1, vol = 0.1, freq = 1200, q = 1, type = 'lowpass', pan = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out(pan));
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  shoot(i) {
    const pan = this.pan(i);
    this.tone({ f: 620 + Math.random() * 120, f2: 300, dur: 0.06, vol: 0.035, pan });
    this.noise({ dur: 0.05, vol: 0.05, freq: 2600, type: 'bandpass', pan });
  }

  hit(i) {
    if (this.throttled('hit' + i, 60)) return;
    this.tone({ f: 1100, f2: 1500, dur: 0.07, type: 'triangle', vol: 0.12, pan: this.pan(i) });
  }

  dry(i) {
    this.tone({ f: 180, f2: 120, dur: 0.08, vol: 0.06, pan: this.pan(i) });
  }

  toss(i) {
    this.tone({ f: 300, f2: 700, dur: 0.15, type: 'triangle', vol: 0.1, pan: this.pan(i) });
  }

  boom(i) {
    const pan = this.pan(i);
    this.noise({ dur: 0.6, vol: 0.5, freq: 500, pan });
    this.tone({ f: 120, f2: 35, dur: 0.5, type: 'sine', vol: 0.5, pan });
  }

  splatted(i) {
    const pan = this.pan(i);
    this.noise({ dur: 0.4, vol: 0.35, freq: 900, pan });
    this.tone({ f: 520, f2: 110, dur: 0.45, type: 'sawtooth', vol: 0.12, pan });
  }

  beep(high) {
    this.tone({ f: high ? 990 : 660, dur: high ? 0.4 : 0.15, type: 'square', vol: 0.1 });
  }

  whistle() {
    this.tone({ f: 1300, f2: 1250, dur: 0.7, type: 'square', vol: 0.09 });
    this.tone({ f: 1000, f2: 950, dur: 0.7, type: 'square', vol: 0.06, delay: 0.05 });
  }
}
