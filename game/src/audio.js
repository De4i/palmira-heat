// All sound is synthesised with WebAudio — no audio files. A lazy AudioContext wakes on the
// first user gesture; until then every call is a no-op. Provides the engine hum and siren as
// continuous voices whose parameters the game sets each frame, one-shot effects (horn, skid,
// crash, punch, gunshot, cash register, mission jingle) and a gentle ambient chord loop.

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.skidNodes = null;
    this.musicTimer = 0;
    this.chordIndex = 0;
  }

  /** Creates the context and starts the ambient loop. Safe to call repeatedly. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngineVoice();
    this.startSkidVoice();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  // ----- continuous voices -------------------------------------------------

  startEngineVoice() {
    const ctx = this.ctx;
    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 55;
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 28;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    oscA.start();
    oscB.start();
    this.engineNodes = { oscA, oscB, filter, gain };
  }

  /** speedRatio 0..1; running=false silences the engine (on foot / menus). */
  setEngine(speedRatio, running) {
    if (!this.engineNodes) return;
    const t = this.ctx.currentTime;
    const freq = 52 + speedRatio * 165;
    this.engineNodes.oscA.frequency.setTargetAtTime(freq, t, 0.06);
    this.engineNodes.oscB.frequency.setTargetAtTime(freq / 2, t, 0.06);
    this.engineNodes.filter.frequency.setTargetAtTime(280 + speedRatio * 900, t, 0.08);
    this.engineNodes.gain.gain.setTargetAtTime(running ? 0.05 + speedRatio * 0.075 : 0, t, 0.09);
  }

  startSkidVoice() {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 2.5;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start();
    this.skidNodes = { gain };
  }

  /** amount 0..1 of tyre-squeal. */
  setSkid(amount) {
    if (!this.skidNodes) return;
    this.skidNodes.gain.gain.setTargetAtTime(amount * 0.12, this.ctx.currentTime, 0.05);
  }

  /** Starts or stops the two-tone police siren. */
  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenNodes) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 700;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 0.7;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 160;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      const gain = ctx.createGain();
      gain.gain.value = 0.028;
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      lfo.start();
      this.sirenNodes = { osc, lfo, gain };
    } else if (!on && this.sirenNodes) {
      const { osc, lfo, gain } = this.sirenNodes;
      gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      const stopAt = this.ctx.currentTime + 0.4;
      osc.stop(stopAt);
      lfo.stop(stopAt);
      this.sirenNodes = null;
    }
  }

  // ----- one-shots ----------------------------------------------------------

  blip(freqA, freqB, duration, type = 'square', volume = 0.12) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  noiseBurst(duration, filterFreq, volume = 0.2, type = 'lowpass') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  playHonk(volume = 0.5) {
    this.blip(370, 340, 0.22, 'square', volume * 0.14);
    this.blip(466, 440, 0.22, 'square', volume * 0.1);
  }

  playCrash(strength = 1) {
    this.noiseBurst(0.28, 500, 0.3 * strength);
    this.blip(120, 40, 0.3, 'sine', 0.35 * strength);
  }

  playPunch() {
    this.noiseBurst(0.09, 900, 0.22);
    this.blip(200, 70, 0.1, 'sine', 0.2);
  }

  playShot() {
    this.noiseBurst(0.14, 2600, 0.3, 'highpass');
    this.blip(900, 120, 0.12, 'sawtooth', 0.14);
  }

  playCash() {
    this.blip(990, 990, 0.09, 'square', 0.1);
    setTimeout(() => this.blip(1320, 1320, 0.16, 'square', 0.1), 70);
  }

  playJingle() {
    if (!this.ctx) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => this.blip(freq, freq, 0.22, 'triangle', 0.16), i * 110);
    });
  }

  playBusted() {
    if (!this.ctx) return;
    const notes = [392, 370, 349, 311];
    notes.forEach((freq, i) => {
      setTimeout(() => this.blip(freq, freq * 0.98, 0.3, 'triangle', 0.15), i * 170);
    });
  }

  // ----- ambient music -------------------------------------------------------

  /** Called every frame; schedules a soft pad chord every ~4 seconds. */
  update(dt) {
    if (!this.ctx || this.muted) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 4.2;
    // Sunny progression: C – G – Am – F, root + fifth + ninth pads.
    const chords = [
      [130.8, 196.0, 261.6], [98.0, 146.8, 246.9], [110.0, 164.8, 261.6], [87.3, 130.8, 220.0],
    ];
    const chord = chords[this.chordIndex % chords.length];
    this.chordIndex += 1;
    const ctx = this.ctx;
    for (const freq of chord) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.016, ctx.currentTime + 1.2);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 4.1);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      osc.stop(ctx.currentTime + 4.2);
    }
  }
}
