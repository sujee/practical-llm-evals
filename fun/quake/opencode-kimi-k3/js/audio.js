// All sounds synthesized with the Web Audio API — no audio assets.
// Everything is wrapped defensively so audio can never crash the game.

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._noiseBuf = null;
    this._ambientNodes = [];
  }

  // Must be called from a user gesture.
  init() {
    try {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      // shared noise buffer (2s white noise)
      const len = this.ctx.sampleRate * 2;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._startAmbient();
    } catch (e) { /* audio unavailable — play silent */ }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  _out(gainVal, dist = 0, delay = 0) {
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime + delay;
    const vol = gainVal / (1 + dist / 260);
    g.gain.setValueAtTime(vol, t);
    g.connect(this.master);
    return { g, t };
  }

  tone({ f0 = 440, f1 = null, dur = 0.2, type = 'sine', gain = 0.3, attack = 0.004, dist = 0, delay = 0, slideType = 'exp' }) {
    if (!this.ctx || this.muted) return;
    try {
      const { g, t } = this._out(gain, dist, delay);
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(20, f0), t);
      if (f1) {
        if (slideType === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        else o.frequency.linearRampToValueAtTime(Math.max(20, f1), t + dur);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain / (1 + dist / 260), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) {}
  }

  noise({ dur = 0.3, gain = 0.3, f0 = 2000, f1 = null, type = 'lowpass', Q = 0.8, dist = 0, delay = 0, attack = 0.003 }) {
    if (!this.ctx || this.muted) return;
    try {
      const { g, t } = this._out(gain, dist, delay);
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuf;
      src.loop = true;
      src.playbackRate.value = 0.7 + Math.random() * 0.6;
      const f = this.ctx.createBiquadFilter();
      f.type = type; f.Q.value = Q;
      f.frequency.setValueAtTime(Math.max(30, f0), t);
      if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain / (1 + dist / 260), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g);
      src.start(t); src.stop(t + dur + 0.05);
    } catch (e) {}
  }

  _growl(f0, f1, dur, gain, dist) { // distorted vocal-ish growl
    if (!this.ctx || this.muted) return;
    try {
      const { g, t } = this._out(gain, dist);
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const ws = this.ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(4 * x); }
      ws.curve = curve;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 2;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain / (1 + dist / 260), t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(ws); ws.connect(f); f.connect(g);
      o.start(t); o.stop(t + dur + 0.05);
      // breathy layer
      this.noise({ dur, gain: gain * 0.4, f0: 500, f1: 250, type: 'bandpass', Q: 1.5, dist });
    } catch (e) {}
  }

  // ---- game sounds ----
  shotgun() {
    this.noise({ dur: 0.22, gain: 0.55, f0: 2600, f1: 350, Q: 0.5 });
    this.tone({ f0: 130, f1: 45, dur: 0.16, type: 'sine', gain: 0.5 });
    this.noise({ dur: 0.05, gain: 0.3, f0: 5000, type: 'highpass' });
  }
  nail() {
    this.noise({ dur: 0.06, gain: 0.22, f0: 3400, type: 'highpass' });
    this.tone({ f0: 950, f1: 300, dur: 0.07, type: 'square', gain: 0.12 });
  }
  ricochet(dist) { this.noise({ dur: 0.05, gain: 0.1, f0: 4200, type: 'highpass', dist }); }
  fleshHit(dist) { this.noise({ dur: 0.08, gain: 0.25, f0: 700, f1: 200, dist }); }
  explosion(dist = 0) {
    this.noise({ dur: 0.7, gain: 0.7, f0: 3200, f1: 90, Q: 0.4, dist });
    this.tone({ f0: 90, f1: 30, dur: 0.6, type: 'sine', gain: 0.65, dist });
  }
  grenadeBounce(dist) { this.tone({ f0: 220, f1: 130, dur: 0.08, type: 'triangle', gain: 0.2, dist }); }
  ogreAlert(dist) { this._growl(150, 55, 0.7, 0.5, dist); }
  ogrePain(dist) { this._growl(180, 90, 0.25, 0.35, dist); }
  ogreDie(dist) { this._growl(140, 35, 1.1, 0.55, dist); }
  chainsaw(dist) {
    this.tone({ f0: 95, f1: 85, dur: 0.5, type: 'sawtooth', gain: 0.25, dist });
    this.noise({ dur: 0.5, gain: 0.15, f0: 2400, type: 'bandpass', Q: 3, dist });
  }
  gruntAlert(dist) {
    this.tone({ f0: 240, f1: 140, dur: 0.14, type: 'square', gain: 0.22, dist });
    this.noise({ dur: 0.12, gain: 0.14, f0: 800, type: 'bandpass', Q: 2, dist });
  }
  gruntShoot(dist) {
    this.noise({ dur: 0.15, gain: 0.3, f0: 2200, f1: 400, dist });
  }
  gruntPain(dist) { this.tone({ f0: 320, f1: 160, dur: 0.16, type: 'square', gain: 0.2, dist }); }
  gruntDie(dist) { this.tone({ f0: 300, f1: 60, dur: 0.5, type: 'square', gain: 0.25, dist }); }
  gib(dist = 0) {
    this.noise({ dur: 0.25, gain: 0.4, f0: 900, f1: 150, dist });
    this.noise({ dur: 0.1, gain: 0.3, f0: 300, f1: 100, delay: 0.05, dist });
  }
  playerPain() {
    this.tone({ f0: 260, f1: 130, dur: 0.18, type: 'square', gain: 0.25 });
    this.noise({ dur: 0.12, gain: 0.15, f0: 600, f1: 200 });
  }
  playerDie() {
    this.tone({ f0: 220, f1: 40, dur: 0.9, type: 'square', gain: 0.35 });
    this.noise({ dur: 0.5, gain: 0.2, f0: 800, f1: 100 });
  }
  land() { this.noise({ dur: 0.09, gain: 0.18, f0: 350, f1: 120 }); }
  jump() { this.noise({ dur: 0.08, gain: 0.08, f0: 500, f1: 900 }); }
  pickupWeapon() {
    this.tone({ f0: 520, dur: 0.09, type: 'square', gain: 0.2 });
    this.tone({ f0: 780, dur: 0.14, type: 'square', gain: 0.2, delay: 0.09 });
  }
  pickupHealth() { this.tone({ f0: 640, f1: 900, dur: 0.12, type: 'sine', gain: 0.22 }); }
  pickupAmmo() { this.noise({ dur: 0.05, gain: 0.2, f0: 1500, Q: 4, type: 'bandpass' }); this.tone({ f0: 300, dur: 0.05, type: 'square', gain: 0.1, delay: 0.03 }); }
  pickupArmor() {
    this.tone({ f0: 220, dur: 0.1, type: 'square', gain: 0.2 });
    this.noise({ dur: 0.12, gain: 0.15, f0: 2500, type: 'highpass', delay: 0.04 });
  }
  pickupKey() {
    this.tone({ f0: 660, dur: 0.1, type: 'square', gain: 0.2 });
    this.tone({ f0: 990, dur: 0.18, type: 'square', gain: 0.2, delay: 0.1 });
  }
  door() {
    this.tone({ f0: 85, f1: 150, dur: 0.55, type: 'sawtooth', gain: 0.15, slideType: 'lin' });
    this.noise({ dur: 0.55, gain: 0.16, f0: 400, f1: 900 });
  }
  locked() {
    this.tone({ f0: 140, dur: 0.12, type: 'square', gain: 0.2 });
    this.tone({ f0: 110, dur: 0.16, type: 'square', gain: 0.2, delay: 0.13 });
  }
  secret() {
    this.tone({ f0: 440, dur: 0.12, type: 'sine', gain: 0.25 });
    this.tone({ f0: 554, dur: 0.12, type: 'sine', gain: 0.25, delay: 0.12 });
    this.tone({ f0: 659, dur: 0.25, type: 'sine', gain: 0.28, delay: 0.24 });
  }
  portal() {
    this.tone({ f0: 300, f1: 1400, dur: 0.8, type: 'sine', gain: 0.3, slideType: 'lin' });
    this.noise({ dur: 0.8, gain: 0.12, f0: 800, f1: 4000, type: 'bandpass', Q: 3 });
  }
  slimeHurt() { this.noise({ dur: 0.2, gain: 0.25, f0: 3000, f1: 1200, type: 'bandpass', Q: 2 }); }
  splash() { this.noise({ dur: 0.3, gain: 0.3, f0: 1200, f1: 300 }); }
  noAmmo() { this.tone({ f0: 180, dur: 0.06, type: 'square', gain: 0.15 }); }
  weaponSwitch() { this.noise({ dur: 0.07, gain: 0.12, f0: 1000, Q: 3, type: 'bandpass' }); }
  sting() { // level complete
    const notes = [220, 277, 330, 440];
    notes.forEach((f, i) => this.tone({ f0: f, dur: 0.35, type: 'square', gain: 0.18, delay: i * 0.16 }));
  }

  _startAmbient() {
    try {
      // wind-ish filtered noise drone
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuf; src.loop = true; src.playbackRate.value = 0.25;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 160; f.Q.value = 0.6;
      const g = this.ctx.createGain(); g.gain.value = 0.05;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07;
      const lfoG = this.ctx.createGain(); lfoG.gain.value = 60;
      lfo.connect(lfoG); lfoG.connect(f.frequency);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(); lfo.start();
      // deep drone
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 48;
      const og = this.ctx.createGain(); og.gain.value = 0.022;
      o.connect(og); og.connect(this.master); o.start();
      this._ambientNodes = [src, lfo, o];
    } catch (e) {}
  }
}
