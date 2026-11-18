// VELVET BAY — every sound is synthesized with WebAudio in code. No audio
// files, no network. Engine hum follows speed, the siren wails while the
// player is wanted, and a slow minor-key pad loops underneath: Velvet Bay
// at dusk, all neon and low notes.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.padOscA = null;
    this.padOscB = null;
    this.padOscC = null;
    this.padGain = null;
    this.muted = false;
    this.started = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this._buildEngine();
    this._buildSiren();
    this._buildPad();
    this.started = true;
  }

  _buildEngine() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const low = this.ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(low);
    low.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  _buildSiren() {
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 780;
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 0.7;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 220;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  _buildPad() {
    // A minor, three voices, slow breathing gain: the dusk pad.
    this.padOscA = this.ctx.createOscillator();
    this.padOscA.type = 'triangle';
    this.padOscA.frequency.value = 110;
    this.padOscB = this.ctx.createOscillator();
    this.padOscB.type = 'triangle';
    this.padOscB.frequency.value = 130.81;
    this.padOscC = this.ctx.createOscillator();
    this.padOscC.type = 'sine';
    this.padOscC.frequency.value = 164.81;
    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.03;
    const slow = this.ctx.createOscillator();
    slow.type = 'sine';
    slow.frequency.value = 0.08;
    const slowGain = this.ctx.createGain();
    slowGain.gain.value = 0.012;
    slow.connect(slowGain);
    slowGain.connect(this.padGain.gain);
    this.padOscA.connect(this.padGain);
    this.padOscB.connect(this.padGain);
    this.padOscC.connect(this.padGain);
    this.padGain.connect(this.master);
    this.padOscA.start();
    this.padOscB.start();
    this.padOscC.start();
    slow.start();
  }

  setEngine(speed01, inCar) {
    if (!this.ctx) return;
    const target = inCar ? 0.05 + speed01 * 0.11 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, this.ctx.currentTime, 0.08);
  }

  setSiren(on) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }

  _blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _noise(dur, vol, filterFreq) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  gunshot() {
    this._noise(0.16, 0.5, 1800);
    this._blip(160, 0.1, 'square', 0.2, 60);
  }

  punch() {
    this._noise(0.08, 0.3, 900);
  }

  pickup() {
    this._blip(660, 0.12, 'sine', 0.3, 990);
  }

  missionDone() {
    this._blip(523, 0.14, 'triangle', 0.35);
    setTimeout(() => this._blip(659, 0.14, 'triangle', 0.35), 130);
    setTimeout(() => this._blip(784, 0.3, 'triangle', 0.35), 260);
  }

  busted() {
    this._blip(220, 0.5, 'sawtooth', 0.25, 110);
  }

  crash() {
    this._noise(0.25, 0.4, 700);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
}
