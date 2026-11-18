// VELVET BAY — every sound is synthesized with WebAudio in code. No audio
// files, no network. Engine hum follows speed, the siren wails while the
// player is wanted, and a slow minor-key pad loops underneath: Velvet Bay
// at dusk, all neon and low notes.
//
// Shape of the code: the three continuous voices (engine, siren, pad)
// are rows in VOICES — each row names its oscillators, gains and wiring,
// built by one generic builder. One-shots (gunshot, pickup, jingles)
// go through two tiny helpers, tone() and noise(), instead of a
// half-dozen near-identical blocks.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.started = false;
    this.voices = {};
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
    this.voices.engine = this._voice({
      oscs: [{ type: 'sawtooth', freq: 55 }],
      chain: [{ kind: 'lowpass', freq: 420 }],
      out: 0,
    });
    this.voices.siren = this._voice({
      oscs: [{ type: 'sine', freq: 780 }],
      chain: [],
      out: 0,
      lfo: { type: 'square', freq: 0.7, depth: 220, target: 'freq' },
    });
    this.voices.pad = this._voice({
      oscs: [
        { type: 'triangle', freq: 110 },
        { type: 'triangle', freq: 130.81 },
        { type: 'sine', freq: 164.81 },
      ],
      chain: [],
      out: 0.03,
      lfo: { type: 'sine', freq: 0.08, depth: 0.012, target: 'gain' },
    });
    this.started = true;
  }

  // Build one continuous voice: oscillators -> optional filter chain ->
  // a gain node -> master. An LFO row wobbles one destination.
  // Returns { oscs, gain } so the caller can steer it later.
  _voice(spec) {
    const oscs = spec.oscs.map((o) => {
      const osc = this.ctx.createOscillator();
      osc.type = o.type;
      osc.frequency.value = o.freq;
      return osc;
    });
    let head = oscs[0];
    let tail = oscs[0];
    for (const node of spec.chain) {
      const f = this.ctx.createBiquadFilter();
      f.type = node.kind;
      f.frequency.value = node.freq;
      tail.connect(f);
      tail = f;
    }
    const gain = this.ctx.createGain();
    gain.gain.value = spec.out;
    tail.connect(gain);
    gain.connect(this.master);
    for (let i = 1; i < oscs.length; i++) oscs[i].connect(gain);
    if (spec.lfo) {
      const lfo = this.ctx.createOscillator();
      lfo.type = spec.lfo.type;
      lfo.frequency.value = spec.lfo.freq;
      const depth = this.ctx.createGain();
      depth.gain.value = spec.lfo.depth;
      lfo.connect(depth);
      if (spec.lfo.target === 'freq') depth.connect(oscs[0].frequency);
      else depth.connect(gain.gain);
      lfo.start();
    }
    for (const osc of oscs) osc.start();
    return { oscs, gain };
  }

  _setGain(voice, value, tau) {
    if (!this.ctx || !this.voices[voice]) return;
    this.voices[voice].gain.gain.setTargetAtTime(value, this.ctx.currentTime, tau);
  }

  setEngine(speed01, inCar) {
    if (!this.ctx) return;
    const target = inCar ? 0.05 + speed01 * 0.11 : 0;
    this._setGain('engine', target, 0.1);
    this.voices.engine.oscs[0].frequency.setTargetAtTime(55 + speed01 * 130, this.ctx.currentTime, 0.08);
  }

  setSiren(on) {
    this._setGain('siren', on ? 0.045 : 0, 0.2);
  }

  // One short pitched blip, optionally sliding down to slideTo.
  _tone(freq, dur, type, vol, slideTo) {
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

  // One burst of filtered noise, fading out over its own length.
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
    this._tone(160, 0.1, 'square', 0.2, 60);
  }

  punch() {
    this._noise(0.08, 0.3, 900);
  }

  pickup() {
    this._tone(660, 0.12, 'sine', 0.3, 990);
  }

  missionDone() {
    // C — E — G arpeggio, one note per step.
    const notes = [523, 659, 784];
    const steps = [0, 130, 260];
    notes.forEach((freq, i) => {
      setTimeout(() => this._tone(freq, i === 2 ? 0.3 : 0.14, 'triangle', 0.35), steps[i]);
    });
  }

  busted() {
    this._tone(220, 0.5, 'sawtooth', 0.25, 110);
  }

  crash() {
    this._noise(0.25, 0.4, 700);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
}
