/**
 * Fully synthesised sound: no audio files. Everything is built from oscillators
 * and filtered noise in the Web Audio graph.
 *
 * Design notes that follow the physics:
 *  - On the Moon there is no air, so outside you only hear what travels through
 *    the suit: your own breathing, the fan, footfalls conducted through the boots.
 *  - Mars has a thin atmosphere: wind is audible but faint and bass-heavy
 *    (the Perseverance microphones recorded exactly that).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private ambGain!: GainNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private suitGain!: GainNode;
  private breathGain!: GainNode;
  private humGain!: GainNode;
  private jetGain!: GainNode;
  private toolGain!: GainNode;
  private alarmGain!: GainNode;
  private noise!: AudioBuffer;
  private reverb!: ConvolverNode;
  private started = false;
  private musicTimer = 0;
  private chordIndex = 0;
  private breathPhase = 0;
  private alarmOn = false;
  private alarmPhase = 0;
  volume = 0.8;
  musicVolume = 0.55;
  muted = false;

  /** Must be called from a user gesture (browsers block audio until then). */
  start(): void {
    if (this.started) {
      void this.ctx?.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx!;
    this.started = true;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    // one second of white noise, looped wherever noise is needed
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // synthetic reverb impulse: decaying noise
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 3.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const c = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) c[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.musicVolume * 0.5;
    this.musicGain.connect(this.master);
    this.musicGain.connect(this.reverb);
    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);
    this.ambGain = ctx.createGain();
    this.ambGain.gain.value = 0.8;
    this.ambGain.connect(this.master);

    const loopNoise = (): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      s.start();
      return s;
    };

    // wind (Mars)
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 220;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    loopNoise().connect(this.windFilter).connect(this.windGain).connect(this.ambGain);

    // suit fan
    const fanFilter = ctx.createBiquadFilter();
    fanFilter.type = 'bandpass';
    fanFilter.frequency.value = 900;
    fanFilter.Q.value = 2.5;
    this.suitGain = ctx.createGain();
    this.suitGain.gain.value = 0;
    loopNoise().connect(fanFilter).connect(this.suitGain).connect(this.ambGain);

    // breathing
    const breathFilter = ctx.createBiquadFilter();
    breathFilter.type = 'bandpass';
    breathFilter.frequency.value = 520;
    breathFilter.Q.value = 1.1;
    this.breathGain = ctx.createGain();
    this.breathGain.gain.value = 0;
    loopNoise().connect(breathFilter).connect(this.breathGain).connect(this.ambGain);

    // habitat / console hum
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    for (const [f, g] of [
      [55, 0.5],
      [110, 0.22],
      [165.2, 0.08],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(this.humGain);
      o.start();
    }
    this.humGain.connect(this.ambGain);

    // jet pack
    const jetFilter = ctx.createBiquadFilter();
    jetFilter.type = 'lowpass';
    jetFilter.frequency.value = 1400;
    this.jetGain = ctx.createGain();
    this.jetGain.gain.value = 0;
    loopNoise().connect(jetFilter).connect(this.jetGain).connect(this.sfxGain);

    // power tool
    this.toolGain = ctx.createGain();
    this.toolGain.gain.value = 0;
    const tool = ctx.createOscillator();
    tool.type = 'sawtooth';
    tool.frequency.value = 142;
    const toolLfo = ctx.createOscillator();
    toolLfo.frequency.value = 23;
    const toolLfoGain = ctx.createGain();
    toolLfoGain.gain.value = 26;
    toolLfo.connect(toolLfoGain).connect(tool.frequency);
    const toolFilter = ctx.createBiquadFilter();
    toolFilter.type = 'lowpass';
    toolFilter.frequency.value = 700;
    tool.connect(toolFilter).connect(this.toolGain).connect(this.sfxGain);
    tool.start();
    toolLfo.start();

    // master alarm
    this.alarmGain = ctx.createGain();
    this.alarmGain.gain.value = 0;
    this.alarmGain.connect(this.sfxGain);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v;
    if (this.ctx) this.musicGain.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.2);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.setVolume(this.volume);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, dest?: AudioNode, when = 0, glideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(freq: number, q: number, dur: number, gain: number, when = 0, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfxGain);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  /** Interface sounds. */
  ui(kind: 'click' | 'hover' | 'open' | 'close' | 'error' | 'place' | 'good' | 'warn' | 'bad' | 'tick'): void {
    if (!this.ctx) return;
    switch (kind) {
      case 'hover':
        this.tone(1800, 0.03, 'sine', 0.025);
        break;
      case 'tick':
        this.tone(1250, 0.03, 'triangle', 0.04);
        break;
      case 'click':
        this.tone(880, 0.05, 'triangle', 0.09);
        this.tone(1320, 0.07, 'sine', 0.05, undefined, 0.02);
        break;
      case 'open':
        this.tone(520, 0.14, 'sine', 0.07, undefined, 0, 1040);
        break;
      case 'close':
        this.tone(900, 0.12, 'sine', 0.06, undefined, 0, 450);
        break;
      case 'error':
        this.tone(190, 0.16, 'square', 0.06);
        this.tone(150, 0.2, 'square', 0.06, undefined, 0.09);
        break;
      case 'place':
        this.burst(180, 1.2, 0.22, 0.5, 0, 'lowpass');
        this.tone(330, 0.2, 'triangle', 0.08, undefined, 0.02, 660);
        break;
      case 'good':
        this.tone(660, 0.14, 'sine', 0.09);
        this.tone(880, 0.14, 'sine', 0.09, undefined, 0.09);
        this.tone(1320, 0.3, 'sine', 0.08, undefined, 0.18);
        break;
      case 'warn':
        this.tone(740, 0.12, 'triangle', 0.1);
        this.tone(740, 0.12, 'triangle', 0.1, undefined, 0.18);
        break;
      case 'bad':
        this.tone(440, 0.18, 'sawtooth', 0.07);
        this.tone(311, 0.3, 'sawtooth', 0.07, undefined, 0.16);
        break;
    }
  }

  /** Radio "Quindar" tones that bracket a transmission from mission control. */
  radio(): void {
    this.tone(2525, 0.25, 'sine', 0.035);
    this.tone(2475, 0.25, 'sine', 0.035, undefined, 0.45);
    this.burst(2400, 0.7, 0.18, 0.02, 0.26);
  }

  step(strength: number, hasAir: boolean): void {
    if (!this.ctx) return;
    // conducted through the boot: a dull thud, with a little grit on Mars
    this.burst(90, 0.9, 0.11, 0.55 * strength, 0, 'lowpass');
    if (hasAir) this.burst(2600, 0.8, 0.07, 0.035 * strength);
  }

  land(strength: number): void {
    this.burst(60, 0.8, 0.3, 0.9 * (0.4 + strength), 0, 'lowpass');
  }

  scan(): void {
    this.tone(320, 1.5, 'sine', 0.09, undefined, 0, 2400);
    this.tone(160, 1.5, 'triangle', 0.05, undefined, 0, 1200);
  }

  pickup(): void {
    this.tone(990, 0.1, 'sine', 0.08);
    this.tone(1485, 0.1, 'sine', 0.08, undefined, 0.07);
    this.tone(1980, 0.26, 'sine', 0.08, undefined, 0.14);
  }

  setJet(on: boolean): void {
    if (this.ctx) this.jetGain.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.06);
  }

  setTool(on: boolean): void {
    if (this.ctx) this.toolGain.gain.setTargetAtTime(on ? 0.05 : 0, this.ctx.currentTime, 0.04);
  }

  setAlarm(on: boolean): void {
    this.alarmOn = on;
  }

  /**
   * Per-frame mix update.
   * @param eva player is outside in a suit
   * @param hasAir world has an atmosphere
   * @param storm 0..1 dust storm
   * @param effort 0..1 how hard the player is working (breathing rate)
   */
  update(dt: number, eva: boolean, hasAir: boolean, storm: number, effort: number, inMenu: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const wind = hasAir ? (eva ? 0.05 + 0.5 * storm : 0.015 + 0.16 * storm) : 0;
    this.windGain.gain.setTargetAtTime(inMenu ? wind * 0.5 : wind, t, 0.4);
    this.windFilter.frequency.setTargetAtTime(180 + 260 * storm + 60 * Math.sin(t * 0.37) + 40 * Math.sin(t * 1.13), t, 0.5);
    this.suitGain.gain.setTargetAtTime(eva ? 0.022 : 0, t, 0.3);
    this.humGain.gain.setTargetAtTime(!eva && !inMenu ? 0.035 : 0, t, 0.5);

    // breathing: inhale / exhale envelope, faster under effort
    this.breathPhase += dt * (0.24 + 0.3 * effort);
    const cyc = this.breathPhase % 1;
    const env = cyc < 0.42 ? Math.sin((cyc / 0.42) * Math.PI) : cyc > 0.52 ? Math.sin(((cyc - 0.52) / 0.48) * Math.PI) * 0.7 : 0;
    this.breathGain.gain.setTargetAtTime(eva ? env * (0.05 + 0.05 * effort) : 0, t, 0.05);

    // alarm: two-tone warble, scheduled in short chunks
    if (this.alarmOn) {
      this.alarmPhase -= dt;
      if (this.alarmPhase <= 0) {
        this.alarmPhase = 1.1;
        this.tone(880, 0.22, 'square', 0.035, undefined, 0);
        this.tone(660, 0.22, 'square', 0.035, undefined, 0.26);
      }
    }

    // generative music: slow pads from a fixed progression, with sparse bell notes
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      this.musicTimer = 9.5;
      this.playChord();
    }
  }

  private playChord(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // D lydian colours: open, weightless, a little bright
    const chords = [
      [146.83, 220.0, 329.63, 415.3],
      [123.47, 185.0, 293.66, 440.0],
      [110.0, 164.81, 277.18, 369.99],
      [146.83, 207.65, 329.63, 493.88],
      [98.0, 146.83, 246.94, 369.99],
    ];
    const chord = chords[this.chordIndex % chords.length];
    this.chordIndex++;
    const t = ctx.currentTime;
    for (let i = 0; i < chord.length; i++) {
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator();
        o.type = i === 0 ? 'triangle' : 'sine';
        o.frequency.value = chord[i];
        o.detune.value = det + (Math.random() - 0.5) * 3;
        const g = ctx.createGain();
        const peak = (i === 0 ? 0.075 : 0.045) / (1 + i * 0.25);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 3.6);
        g.gain.setValueAtTime(peak, t + 6.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 12.5);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(500, t);
        f.frequency.linearRampToValueAtTime(1500, t + 5);
        f.frequency.linearRampToValueAtTime(600, t + 12);
        o.connect(f).connect(g).connect(this.musicGain);
        o.start(t);
        o.stop(t + 13);
      }
    }
    // bells
    const scale = [587.33, 659.25, 739.99, 830.61, 987.77, 1108.73, 1174.66];
    const n = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const when = 1 + Math.random() * 7;
      const f = scale[Math.floor(Math.random() * scale.length)];
      this.tone(f, 2.6, 'sine', 0.035, this.musicGain, when);
      this.tone(f * 2.01, 1.2, 'sine', 0.008, this.musicGain, when);
    }
  }
}
