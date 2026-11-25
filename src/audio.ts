import type { TrashRarity } from './types';

/**
 * Procedural Tropical Audio Engine using Web Audio API.
 * Synthesizes ocean surf ambience, rainstorm noise, wooden pentatonic
 * kalimba/marimba ripples, rarity sparkle chimes, mangrove blooms, and UI sounds.
 */

const PENTATONIC = [
  523.25, // C5
  587.33, // D5
  659.25, // E5
  783.99, // G5
  880.0, // A5
  1046.5, // C6
  1174.66, // D6
  1318.51, // E6
  1567.98, // G6
];

export class TropicalAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private oceanGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private initialized = false;
  private stormMix = 0;
  private lastCollectSfxMs = 0;
  private motorGain: GainNode | null = null;
  private motorNodes: OscillatorNode[] = [];
  private motorStop: number | null = null;
  private birdT = 1.5;

  public isMuted(): boolean {
    return this.muted;
  }

  public unlock(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.65;
    this.masterGain.connect(this.ctx.destination);

    const sampleRate = this.ctx.sampleRate;
    const len = sampleRate * 3;
    const buffer = this.ctx.createBuffer(1, len, sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2 + white * 0.015) * 1.8;
    }
    this.noiseBuffer = buffer;

    this.startAmbience();
    this.initialized = true;
  }

  private startAmbience(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;

    const oceanSrc = this.ctx.createBufferSource();
    oceanSrc.buffer = this.noiseBuffer;
    oceanSrc.loop = true;

    const oceanFilter = this.ctx.createBiquadFilter();
    oceanFilter.type = 'lowpass';
    oceanFilter.frequency.value = 340;
    oceanFilter.Q.value = 0.7;

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.14;
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain);
    lfoGain.connect(oceanFilter.frequency);
    lfo.start();

    this.oceanGain = this.ctx.createGain();
    this.oceanGain.gain.value = 0.16;

    oceanSrc.connect(oceanFilter);
    oceanFilter.connect(this.oceanGain);
    this.oceanGain.connect(this.masterGain);
    oceanSrc.start();

    const rainSrc = this.ctx.createBufferSource();
    rainSrc.buffer = this.noiseBuffer;
    rainSrc.loop = true;

    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1850;
    rainFilter.Q.value = 0.55;

    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0.0001;

    rainSrc.connect(rainFilter);
    rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.masterGain);
    rainSrc.start();
  }

  public setStormAmbience(amount: number): void {
    this.stormMix = Math.max(0, Math.min(1, amount));
    if (!this.ctx || !this.rainGain || !this.oceanGain) return;
    const now = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(0.0001 + this.stormMix * 0.14, now, 0.4);
    this.oceanGain.gain.setTargetAtTime(0.16 + this.stormMix * 0.12, now, 0.4);
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.65, this.ctx.currentTime, 0.04);
    }
    return this.muted;
  }

  private playKalimbaTone(freq: number, duration: number, volume: number, delay = 0): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime + delay;

    const osc = this.ctx.createOscillator();
    const harm = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const harmGain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    harm.type = 'triangle';
    harm.frequency.setValueAtTime(freq * 2.0, t);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    harmGain.gain.setValueAtTime(0.0001, t);
    harmGain.gain.exponentialRampToValueAtTime(volume * 0.22, t + 0.008);
    harmGain.gain.exponentialRampToValueAtTime(0.0001, t + duration * 0.45);

    osc.connect(gain);
    harm.connect(harmGain);
    harmGain.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    harm.start(t);
    osc.stop(t + duration + 0.04);
    harm.stop(t + duration + 0.04);
  }

  private playWaterWhoosh(charge: number, volume = 0.24): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const t = this.ctx.currentTime;
    const dur = 0.24 + charge * 0.42;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(420 + charge * 180, t);
    filter.frequency.exponentialRampToValueAtTime(1450 - charge * 350, t + dur * 0.4);
    filter.frequency.exponentialRampToValueAtTime(260, t + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(volume * (0.7 + charge * 0.6), t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    src.start(t, Math.random() * 1.2, dur + 0.05);
  }

  public playWaveLaunch(charge: number, isEcho = false): void {
    this.unlock();
    if (!this.ctx || this.muted) return;

    const idx = isEcho
      ? Math.floor(Math.random() * 4) + 3
      : Math.max(
          0,
          Math.min(
            PENTATONIC.length - 1,
            Math.round((1 - charge) * 5) + Math.floor(Math.random() * 2)
          )
        );
    const freq = PENTATONIC[idx] * (charge > 0.65 ? 0.5 : 1);

    this.playKalimbaTone(freq, 0.35 + charge * 0.45, isEcho ? 0.1 : 0.17 + charge * 0.08);
    if (charge > 0.55 && !isEcho) {
      this.playKalimbaTone(freq * 1.5, 0.5, 0.1, 0.04);
    }
    this.playWaterWhoosh(charge, isEcho ? 0.11 : 0.21);
  }

  public playTrashCollect(comboCount: number, rarity: TrashRarity = 'common'): void {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    // Smooth micro-debounce so mass sweeps play a cascading arpeggio without clipping
    if (rarity === 'common' && now - this.lastCollectSfxMs < 46) return;
    this.lastCollectSfxMs = now;

    const idx = Math.min(PENTATONIC.length - 1, comboCount % PENTATONIC.length);
    const freq = PENTATONIC[idx];

    if (rarity === 'legendary') {
      this.playKalimbaTone(659.25, 0.55, 0.22, 0);
      this.playKalimbaTone(880.0, 0.6, 0.2, 0.06);
      this.playKalimbaTone(1318.51, 0.7, 0.2, 0.12);
      this.playKalimbaTone(1567.98, 0.85, 0.18, 0.18);
    } else if (rarity === 'epic') {
      this.playKalimbaTone(587.33, 0.42, 0.2, 0);
      this.playKalimbaTone(880.0, 0.5, 0.18, 0.05);
      this.playKalimbaTone(1174.66, 0.6, 0.16, 0.11);
    } else if (rarity === 'rare') {
      this.playKalimbaTone(freq, 0.36, 0.19, 0);
      this.playKalimbaTone(freq * 1.5, 0.42, 0.14, 0.045);
    } else {
      this.playKalimbaTone(freq, 0.26, 0.16);
      this.playKalimbaTone(freq * 1.25, 0.2, 0.07, 0.03);
    }
  }

  public playShopUnlock(): void {
    if (!this.ctx || this.muted) return;
    this.playKalimbaTone(523.25, 0.4, 0.18, 0);
    this.playKalimbaTone(659.25, 0.45, 0.18, 0.07);
    this.playKalimbaTone(1046.5, 0.65, 0.2, 0.14);
  }

  public playMangrovePlant(): void {
    if (!this.ctx || this.muted) return;
    this.playKalimbaTone(392.0, 0.45, 0.2, 0);
    this.playKalimbaTone(523.25, 0.5, 0.18, 0.07);
    this.playKalimbaTone(659.25, 0.6, 0.18, 0.14);
    this.playKalimbaTone(783.99, 0.75, 0.15, 0.21);
  }

  public playBoatSaved(): void {
    if (!this.ctx || this.muted) return;
    this.playKalimbaTone(261.63, 0.55, 0.22, 0);
    this.playKalimbaTone(392.0, 0.6, 0.2, 0.08);
    this.playKalimbaTone(523.25, 0.75, 0.22, 0.16);
    this.playKalimbaTone(659.25, 0.9, 0.16, 0.24);
  }

  public playFireDouse(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(2200, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.24, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.masterGain);
    src.start(t, 0.2, 0.6);

    this.playKalimbaTone(659.25, 0.4, 0.16, 0.06);
    this.playKalimbaTone(880.0, 0.45, 0.16, 0.13);
    this.playKalimbaTone(1318.51, 0.6, 0.15, 0.2);
  }

  public playResonanceBurst(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;

    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(165, t);
    sub.frequency.exponentialRampToValueAtTime(58, t + 0.42);
    subGain.gain.setValueAtTime(0.32, t);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(t);
    sub.stop(t + 0.5);

    this.playKalimbaTone(523.25, 0.65, 0.2, 0);
    this.playKalimbaTone(783.99, 0.75, 0.18, 0.03);
    this.playKalimbaTone(1046.5, 0.9, 0.16, 0.07);
    this.playWaterWhoosh(0.95, 0.26);
  }

  public playTrawlerHit(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.26);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.32);
    this.playWaterWhoosh(0.7, 0.2);
  }

  public playUpgradeBuy(): void {
    this.unlock();
    if (!this.ctx || this.muted) return;
    this.playKalimbaTone(587.33, 0.28, 0.2, 0);
    this.playKalimbaTone(880.0, 0.4, 0.2, 0.06);
  }

  public playUiClick(): void {
    this.unlock();
    if (!this.ctx || this.muted) return;
    this.playKalimbaTone(783.99, 0.1, 0.11, 0);
  }

  public playUiTab(): void {
    this.unlock();
    if (!this.ctx || this.muted) return;
    this.playKalimbaTone(659.25, 0.11, 0.11, 0);
    this.playKalimbaTone(987.77, 0.14, 0.09, 0.03);
  }

  public playUiOpen(): void {
    this.unlock();
    if (!this.ctx || this.muted) return;
    this.playKalimbaTone(523.25, 0.16, 0.12, 0);
    this.playKalimbaTone(783.99, 0.22, 0.13, 0.045);
  }

  public playUiClose(): void {
    if (!this.ctx || this.muted) return;
    this.playKalimbaTone(659.25, 0.14, 0.1, 0);
    this.playKalimbaTone(440.0, 0.18, 0.1, 0.04);
  }

  public playUiError(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.14);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.17);
  }

  public playAchievementClaim(): void {
    this.unlock();
    if (!this.ctx || this.muted) return;
    this.playKalimbaTone(523.25, 0.3, 0.19, 0);
    this.playKalimbaTone(659.25, 0.35, 0.19, 0.06);
    this.playKalimbaTone(783.99, 0.42, 0.2, 0.12);
    this.playKalimbaTone(1046.5, 0.65, 0.22, 0.18);
  }

  /** The opening's outboard: a buzzing two-stroke hum, 0..1. Built on demand, torn down when it goes quiet. */
  public setMotor(level: number): void {
    if (!this.ctx || !this.masterGain) return;
    const k = Math.max(0, Math.min(1, level));
    const now = this.ctx.currentTime;
    if (k > 0.001) {
      if (this.motorStop !== null) {
        window.clearTimeout(this.motorStop);
        this.motorStop = null;
      }
      if (!this.motorGain) {
        const ctx = this.ctx;
        const saw = ctx.createOscillator();
        saw.type = 'sawtooth';
        saw.frequency.value = 54;
        const sq = ctx.createOscillator();
        sq.type = 'square';
        sq.frequency.value = 108.6;
        const sqGain = ctx.createGain();
        sqGain.gain.value = 0.3;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 420;
        lp.Q.value = 1.6;
        // the putter of a small engine
        const trem = ctx.createOscillator();
        trem.frequency.value = 11.5;
        const tremDepth = ctx.createGain();
        tremDepth.gain.value = 0.28;
        const amp = ctx.createGain();
        amp.gain.value = 0.72;
        trem.connect(tremDepth);
        tremDepth.connect(amp.gain);
        const out = ctx.createGain();
        out.gain.value = 0.0001;
        saw.connect(lp);
        sq.connect(sqGain);
        sqGain.connect(lp);
        lp.connect(amp);
        amp.connect(out);
        out.connect(this.masterGain);
        saw.start();
        sq.start();
        trem.start();
        this.motorGain = out;
        this.motorNodes = [saw, sq, trem];
      }
      this.motorGain.gain.setTargetAtTime(0.0001 + k * 0.09, now, 0.12);
      for (const o of this.motorNodes.slice(0, 2)) o.detune.setTargetAtTime(k * 260, now, 0.3);
    } else if (this.motorGain && this.motorStop === null) {
      this.motorGain.gain.setTargetAtTime(0.0001, now, 0.1);
      this.motorStop = window.setTimeout(() => {
        this.motorStop = null;
        for (const o of this.motorNodes) o.stop();
        this.motorGain?.disconnect();
        this.motorGain = null;
        this.motorNodes = [];
      }, 700);
    }
  }

  /** Something hitting the water: a short wash of spray and a plop. */
  public playSplash(strength = 1): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(1350, t);
    bp.frequency.exponentialRampToValueAtTime(360, t + 0.32);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.17 * strength, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.masterGain);
    src.start(t, Math.random() * 2, 0.44);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(330, t);
    o.frequency.exponentialRampToValueAtTime(88, t + 0.12);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.13 * strength, t + 0.008);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(og);
    og.connect(this.masterGain);
    o.start(t);
    o.stop(t + 0.18);
  }

  /** Something thrown: a quick rising swish of air. */
  public playToss(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.masterGain);
    src.start(t, Math.random() * 2, 0.22);
  }

  /* ------------------------------------------------------------------ birds */

  /**
   * Birdsong for this moment, called every frame. `level` 0 is silence and 1 a busy morning; it sets
   * how often something sings. `gulls` is how much of it comes from the sea rather than the forest.
   */
  public updateBirds(dt: number, level: number, gulls = 0.3): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    this.birdT -= dt;
    if (this.birdT > 0) return;
    const lv = Math.max(0, Math.min(1, level));
    if (lv < 0.03) {
      this.birdT = 0.8;
      return;
    }
    // a quiet lagoon gets a call every seven seconds or so, a lively one every second or two
    this.birdT = (7.5 - lv * 6) * (0.55 + Math.random() * 0.9);
    if (Math.random() < gulls * 0.45) this.playGull();
    else this.playSongbird(lv);
  }

  /** A few birds at once: the forest answering a mangrove, a rescue, a win. */
  public playBirdBurst(strength = 1): void {
    if (!this.ctx || this.muted) return;
    const n = 2 + Math.round(strength * 3);
    for (let i = 0; i < n; i++) this.playSongbird(1, i * 0.26 + Math.random() * 0.12);
    this.birdT = Math.max(this.birdT, 2);
  }

  /** One sliding note: the building block of every bird here. */
  private chirp(t: number, freqs: number[], dur: number, vol: number, pan: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freqs[0], t);
    for (let i = 1; i < freqs.length; i++) o.frequency.exponentialRampToValueAtTime(freqs[i], t + (dur * i) / (freqs.length - 1));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.014, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    // older Safari has no stereo panner; the bird is just in the middle there
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.masterGain!);
    } else g.connect(this.masterGain!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Something small in the trees: the forest is on the left of the screen, so it sings from the left. */
  private playSongbird(level: number, delay = 0): void {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime + 0.02 + delay;
    const pan = -0.2 - Math.random() * 0.6;
    const vol = 0.065 + Math.random() * 0.03;
    const kind = Math.floor(Math.random() * (level > 0.55 ? 4 : 3));
    if (kind === 0) {
      // tweet tweet: quick upward flicks
      const n = 2 + Math.floor(Math.random() * 3);
      const f = 2600 + Math.random() * 900;
      for (let i = 0; i < n; i++) this.chirp(t + i * 0.13, [f, f * 1.45], 0.07, vol, pan);
    } else if (kind === 1) {
      // a trill that runs down
      const f = 3400 + Math.random() * 800;
      for (let i = 0; i < 9; i++) {
        const k = f * (1 - i * 0.014);
        this.chirp(t + i * 0.036, [k, k * 0.9], 0.03, vol * 0.8, pan);
      }
    } else if (kind === 2) {
      // a two-note whistle, down and then up
      const f = 1800 + Math.random() * 500;
      this.chirp(t, [f * 1.2, f], 0.18, vol, pan);
      this.chirp(t + 0.24, [f * 0.9, f * 1.35], 0.22, vol, pan);
    } else {
      // the koel, climbing a little higher each time: the sound of a coastal morning
      const f = 720 + Math.random() * 80;
      for (let i = 0; i < 3; i++) this.chirp(t + i * 0.55, [f * (1 + i * 0.08), f * (1.42 + i * 0.1)], 0.34, vol * 1.15, pan, 'triangle');
    }
  }

  /** A gull laughing over the water, from the sea side of the screen. */
  private playGull(): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const pan = 0.2 + Math.random() * 0.6;
    const n = 2 + Math.floor(Math.random() * 2);
    const out = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    if (out) {
      out.pan.value = pan;
      out.connect(this.masterGain);
    }
    for (let i = 0; i < n; i++) {
      const s = t + i * 0.3;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(1250, s);
      o.frequency.exponentialRampToValueAtTime(1650, s + 0.06);
      o.frequency.exponentialRampToValueAtTime(820, s + 0.24);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1500;
      bp.Q.value = 2.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.11, s + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.26);
      o.connect(bp);
      bp.connect(g);
      g.connect(out ?? this.masterGain);
      o.start(s);
      o.stop(s + 0.28);
    }
  }

  /* ------------------------------------------------------------------ the dolphin */

  /** Dolphin whistles: `distress` is a wavering upsweep with clicks, `happy` a run of bright chirps. */
  public playDolphin(mood: 'distress' | 'happy'): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const distress = mood === 'distress';
    const calls = distress ? 2 : 3;
    for (let c = 0; c < calls; c++) {
      const s = t + c * (distress ? 0.42 : 0.19);
      const dur = distress ? 0.38 : 0.17;
      const f0 = distress ? 1900 : 2300 + c * 320;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, s);
      if (distress) {
        o.frequency.exponentialRampToValueAtTime(3600, s + 0.22);
        o.frequency.exponentialRampToValueAtTime(2500, s + dur);
      } else {
        o.frequency.exponentialRampToValueAtTime(f0 * 1.6, s + 0.09);
        o.frequency.exponentialRampToValueAtTime(f0 * 1.25, s + dur);
      }
      const lfo = ctx.createOscillator();
      lfo.frequency.value = distress ? 21 : 34;
      const depth = ctx.createGain();
      depth.gain.value = distress ? 170 : 90;
      lfo.connect(depth);
      depth.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.07, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
      o.connect(g);
      g.connect(this.masterGain);
      o.start(s);
      lfo.start(s);
      o.stop(s + dur + 0.02);
      lfo.stop(s + dur + 0.02);
    }
    if (distress && this.noiseBuffer) {
      // echolocation clicks
      for (let i = 0; i < 6; i++) {
        const s = t + 0.85 + i * 0.032;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 3200;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.09, s);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.012);
        src.connect(hp);
        hp.connect(g);
        g.connect(this.masterGain);
        src.start(s, Math.random() * 2, 0.015);
      }
    }
  }

  /** Netting giving way: a sharp tear and a thump in the water. */
  public playNetSnap(strength = 1): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(2600, t);
    hp.frequency.exponentialRampToValueAtTime(900, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.2 * strength, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.masterGain);
    src.start(t, Math.random() * 2, 0.14);
    this.playSplash(0.7 * strength);
    this.playKalimbaTone(783.99, 0.3, 0.12, 0.05);
    this.playKalimbaTone(1046.5, 0.36, 0.1, 0.1);
  }

  /** Something is wrong: two falling notes before the camera goes to look. */
  public playAlert(): void {
    if (!this.ctx || this.muted) return;
    this.playKalimbaTone(659.25, 0.26, 0.16, 0);
    this.playKalimbaTone(493.88, 0.4, 0.16, 0.16);
  }

  /** A.L.U.N. coming online. */
  public playAlunWake(): void {
    if (!this.ctx || this.muted) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => this.playKalimbaTone(f, 0.7 + i * 0.08, 0.17, i * 0.075));
  }

  public playVictory(): void {
    if (!this.ctx || this.muted) return;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
    notes.forEach((f, i) => this.playKalimbaTone(f, 1.1, 0.2, i * 0.09));
  }
}
