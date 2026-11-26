import { TropicalMusicEngine } from './music';
import { DEFAULT_SETTINGS, type Volumes } from './settings';
import type { TimeOfDay, TrashRarity } from './types';

/**
 * Hybrid Tropical Audio Engine for ALUN: Gema Pesisir Tropis.
 * Plays ElevenLabs-generated SFX & seamless ambient stems via Web Audio API,
 * plus an original real-time procedural Web Audio soundtrack that crossfades
 * smoothly across Day, Sunset, eerie/calm Night, and Monsoon Boss nights.
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

type SfxId =
  | 'ocean-ambience'
  | 'rain-monsoon'
  | 'storm-wind'
  | 'thunder-1'
  | 'thunder-2'
  | 'weather-shift'
  | 'wave-light'
  | 'wave-heavy'
  | 'wave-echo'
  | 'wave-charge'
  | 'shore-splash'
  | 'resonance-burst'
  | 'net-catch-1'
  | 'net-catch-2'
  | 'trash-rare'
  | 'trash-epic'
  | 'trash-legendary'
  | 'combo-milestone'
  | 'combo-break'
  | 'ui-click'
  | 'ui-hover'
  | 'ui-tab'
  | 'ui-open'
  | 'ui-close'
  | 'ui-error'
  | 'radio-in'
  | 'radio-out'
  | 'upgrade-buy'
  | 'shop-unlock'
  | 'achievement-claim'
  | 'mangrove-plant'
  | 'boat-saved'
  | 'fire-douse'
  | 'trawler-hit'
  | 'splash'
  | 'net-snap'
  | 'bird-tropical-1'
  | 'bird-tropical-2'
  | 'seagull'
  | 'victory';

const PRIORITY_SFX: SfxId[] = [
  'ocean-ambience',
  'ui-click',
  'ui-hover',
  'ui-tab',
  'ui-open',
  'ui-close',
  'ui-error',
  'radio-in',
  'radio-out',
  'wave-light',
  'wave-heavy',
  'wave-echo',
  'wave-charge',
  'net-catch-1',
  'net-catch-2',
  'combo-milestone',
  'combo-break',
  'shore-splash',
];

const SECONDARY_SFX: SfxId[] = [
  'rain-monsoon',
  'storm-wind',
  'thunder-1',
  'thunder-2',
  'weather-shift',
  'trash-rare',
  'trash-epic',
  'trash-legendary',
  'resonance-burst',
  'upgrade-buy',
  'shop-unlock',
  'achievement-claim',
  'mangrove-plant',
  'boat-saved',
  'fire-douse',
  'trawler-hit',
  'splash',
  'net-snap',
  'bird-tropical-1',
  'bird-tropical-2',
  'seagull',
  'victory',
];

interface PlayOptions {
  volume?: number;
  rate?: number;
  pan?: number;
  delay?: number;
  bus?: 'sfx' | 'ui' | 'ambience' | 'voice';
}

/** Slider position to gain: half way sounds about half as loud. */
const curve = (v: number): number => v * v;

interface AmbienceTargets {
  ocean: number;
  wind: number;
  rain: number;
  oceanFilterHz: number;
}

export class TropicalAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private uiBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  /** People on the radio: their clips, murmur and squelch. */
  private voiceBus: GainNode | null = null;
  private voiceMeter: AnalyserNode | null = null;
  private meterData: Float32Array<ArrayBuffer> | null = null;
  private volumes: Volumes = { ...DEFAULT_SETTINGS.volume };
  /** A line is being spoken: music and weather step back. */
  private voiceDucked = false;
  private lastHoverMs = 0;

  // Original real-time Web Audio dynamic soundtrack (Day / Sunset / eerie-calm Night / Monsoon Boss)
  private music: TropicalMusicEngine | null = null;

  // Procedural fallback ambience nodes (crossfaded out once ElevenLabs loops decode)
  private fallbackOceanGain: GainNode | null = null;
  private fallbackRainGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // ElevenLabs looping ambience stems
  private oceanLoopGain: GainNode | null = null;
  private oceanLoopFilter: BiquadFilterNode | null = null;
  private rainLoopGain: GainNode | null = null;
  private windLoopGain: GainNode | null = null;
  private oceanLoopActive = false;
  private rainLoopActive = false;
  private windLoopActive = false;

  // Wave charge loop state
  private chargeGain: GainNode | null = null;
  private chargeFilter: BiquadFilterNode | null = null;
  private chargeSource: AudioBufferSourceNode | null = null;
  private chargeOsc: OscillatorNode | null = null;
  private chargeLevel = 0;

  // Decoded ElevenLabs buffers
  private buffers = new Map<SfxId, AudioBuffer>();
  private loadingStarted = false;

  // Runtime state
  private muted = false;
  private initialized = false;
  private shopDucked = false;
  private stormMix = 0;
  private currentTod: TimeOfDay | null = null;
  private thunderTimer = 4.5;
  private lastCollectSfxMs = 0;
  private lastShoreSplashMs = 0;
  private catchToggle = 0;

  // Opening boat motor synth
  private motorGain: GainNode | null = null;
  private motorNodes: OscillatorNode[] = [];
  private motorStop: number | null = null;

  // Birdsong timer
  private birdT = 1.6;

  public isMuted(): boolean {
    return this.muted;
  }

  public unlock(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      this.music?.setMuted(this.muted);
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    // Gentle master dynamics compressor keeps dense sweeps & storms warm and clip-free
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 4;
    comp.attack.value = 0.006;
    comp.release.value = 0.16;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.masterLevel();

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = curve(this.volumes.sfx);

    this.uiBus = ctx.createGain();
    this.uiBus.gain.value = 0.92 * curve(this.volumes.ui);

    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = this.ambienceLevel();

    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = curve(this.volumes.voice);
    this.voiceMeter = ctx.createAnalyser();
    this.voiceMeter.fftSize = 512;
    this.voiceMeter.smoothingTimeConstant = 0.2;
    this.meterData = new Float32Array(this.voiceMeter.fftSize);
    this.voiceBus.connect(this.voiceMeter);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.musicFilter.Q.value = 0.5;

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.0001;

    this.sfxBus.connect(comp);
    this.uiBus.connect(comp);
    this.ambienceBus.connect(comp);
    this.voiceBus.connect(comp);
    this.musicFilter.connect(this.musicBus);
    this.musicBus.connect(comp);
    comp.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    // Procedural pink-noise buffer (used for fallback & subtle water textures)
    const sampleRate = ctx.sampleRate;
    const len = sampleRate * 3;
    const buffer = ctx.createBuffer(1, len, sampleRate);
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

    this.startFallbackAmbience();
    this.initialized = true;
    this.preloadAssets();
    this.startMusic();
  }

  private preloadAssets(): void {
    if (this.loadingStarted || !this.ctx) return;
    this.loadingStarted = true;

    const loadBatch = async (ids: SfxId[]) => {
      await Promise.all(ids.map((id) => this.loadSample(id)));
    };

    void loadBatch(PRIORITY_SFX).then(() => loadBatch(SECONDARY_SFX));
  }

  private async loadSample(id: SfxId): Promise<void> {
    if (!this.ctx || this.buffers.has(id)) return;
    try {
      const res = await fetch(`./audio/${id}.mp3`);
      if (!res.ok) return;
      const arr = await res.arrayBuffer();
      if (!this.ctx) return;
      const decoded = await this.ctx.decodeAudioData(arr);
      this.buffers.set(id, decoded);

      if (id === 'ocean-ambience') this.startOceanLoop(decoded);
      else if (id === 'rain-monsoon') this.startRainLoop(decoded);
      else if (id === 'storm-wind') this.startWindLoop(decoded);
    } catch {
      // Fallback procedural Web Audio remains active seamlessly
    }
  }

  private getAmbienceTargets(): AmbienceTargets {
    const tod = this.currentTod;
    const storm = this.stormMix;
    if (storm > 0.02) {
      return {
        ocean: 0.34 + storm * 0.16,
        wind: 0.06 + storm * 0.3,
        rain: 0.0001 + storm * 0.42,
        oceanFilterHz: 2600 + storm * 2400,
      };
    }
    if (tod === 'night') {
      return { ocean: 0.34, wind: 0.14, rain: 0.0001, oceanFilterHz: 2100 };
    }
    if (tod === 'sunset') {
      return { ocean: 0.36, wind: 0.15, rain: 0.0001, oceanFilterHz: 2400 };
    }
    if (tod === 'dawn') {
      return { ocean: 0.32, wind: 0.06, rain: 0.0001, oceanFilterHz: 3200 };
    }
    if (tod === 'noon') {
      return { ocean: 0.35, wind: 0.09, rain: 0.0001, oceanFilterHz: 3000 };
    }
    return { ocean: 0.33, wind: 0.05, rain: 0.0001, oceanFilterHz: 2800 };
  }

  private applyAmbienceMix(timeConstant = 0.55): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const targets = this.getAmbienceTargets();

    if (this.oceanLoopGain && this.oceanLoopActive) {
      this.oceanLoopGain.gain.setTargetAtTime(targets.ocean, now, timeConstant);
      this.oceanLoopFilter?.frequency.setTargetAtTime(targets.oceanFilterHz, now, timeConstant);
      this.fallbackOceanGain?.gain.setTargetAtTime(0.0001, now, 0.7);
    } else if (this.fallbackOceanGain) {
      this.fallbackOceanGain.gain.setTargetAtTime(0.14 + this.stormMix * 0.12, now, timeConstant);
    }

    if (this.rainLoopGain && this.rainLoopActive) {
      this.rainLoopGain.gain.setTargetAtTime(targets.rain, now, timeConstant);
      this.fallbackRainGain?.gain.setTargetAtTime(0.0001, now, 0.7);
    } else if (this.fallbackRainGain) {
      this.fallbackRainGain.gain.setTargetAtTime(0.0001 + this.stormMix * 0.14, now, timeConstant);
    }

    if (this.windLoopGain && this.windLoopActive) {
      this.windLoopGain.gain.setTargetAtTime(targets.wind, now, timeConstant);
    }

    this.applyMusicMix(timeConstant);
  }

  private startMusic(): void {
    if (this.music || !this.ctx || !this.musicFilter || !this.noiseBuffer) return;
    this.music = new TropicalMusicEngine(this.ctx, this.musicFilter, this.noiseBuffer);
    this.music.setMuted(this.muted);
    this.music.setTimeOfDay(this.currentTod ?? 'morning');
    this.music.start();
    this.applyMusicMix(1.1);
  }

  public setPaused(paused: boolean): void {
    this.music?.setPaused(paused);
  }

  private applyMusicMix(timeConstant = 0.55): void {
    if (!this.ctx || !this.musicBus || !this.musicFilter) return;
    const now = this.ctx.currentTime;
    const isNight = this.currentTod === 'night';
    const baseGain = this.stormMix > 0.05 ? 0.36 : isNight ? 0.42 : 0.44;
    const targetGain = (this.shopDucked ? baseGain * 0.48 : baseGain) * curve(this.volumes.music) * (this.voiceDucked ? 0.6 : 1);
    const targetHz = this.shopDucked
      ? 2200
      : this.stormMix > 0.05
        ? 11000
        : isNight
          ? 13500
          : 18000;

    this.musicBus.gain.setTargetAtTime(targetGain, now, timeConstant);
    this.musicFilter.frequency.setTargetAtTime(targetHz, now, timeConstant);
  }

  private startFallbackAmbience(): void {
    if (!this.ctx || !this.ambienceBus || !this.noiseBuffer) return;

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

    this.fallbackOceanGain = this.ctx.createGain();
    this.fallbackOceanGain.gain.value = 0.14;

    oceanSrc.connect(oceanFilter);
    oceanFilter.connect(this.fallbackOceanGain);
    this.fallbackOceanGain.connect(this.ambienceBus);
    oceanSrc.start();

    const rainSrc = this.ctx.createBufferSource();
    rainSrc.buffer = this.noiseBuffer;
    rainSrc.loop = true;

    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1850;
    rainFilter.Q.value = 0.55;

    this.fallbackRainGain = this.ctx.createGain();
    this.fallbackRainGain.gain.value = 0.0001;

    rainSrc.connect(rainFilter);
    rainFilter.connect(this.fallbackRainGain);
    this.fallbackRainGain.connect(this.ambienceBus);
    rainSrc.start();
  }

  private startOceanLoop(buffer: AudioBuffer): void {
    if (!this.ctx || !this.ambienceBus || this.oceanLoopActive) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2800;
    filter.Q.value = 0.5;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambienceBus);
    src.start();

    this.oceanLoopFilter = filter;
    this.oceanLoopGain = gain;
    this.oceanLoopActive = true;
    this.applyAmbienceMix(0.9);
  }

  private startRainLoop(buffer: AudioBuffer): void {
    if (!this.ctx || !this.ambienceBus || this.rainLoopActive) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;

    src.connect(gain);
    gain.connect(this.ambienceBus);
    src.start();

    this.rainLoopGain = gain;
    this.rainLoopActive = true;
    this.applyAmbienceMix(0.6);
  }

  private startWindLoop(buffer: AudioBuffer): void {
    if (!this.ctx || !this.ambienceBus || this.windLoopActive) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;

    src.connect(gain);
    gain.connect(this.ambienceBus);
    src.start();

    this.windLoopGain = gain;
    this.windLoopActive = true;
    this.applyAmbienceMix(0.7);
  }

  private playBuffer(id: SfxId, opts: PlayOptions = {}): boolean {
    if (!this.ctx || this.muted) return false;
    const buffer = this.buffers.get(id);
    if (!buffer) return false;

    const bus =
      opts.bus === 'ui'
        ? this.uiBus
        : opts.bus === 'ambience'
          ? this.ambienceBus
          : opts.bus === 'voice'
            ? this.voiceBus
            : this.sfxBus;
    if (!bus) return false;

    const t = this.ctx.currentTime + (opts.delay ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    if (opts.rate && opts.rate !== 1) {
      src.playbackRate.setValueAtTime(opts.rate, t);
    }

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(opts.volume ?? 0.7, t);

    src.connect(gain);
    const pan = opts.pan ?? 0;
    if (Math.abs(pan) > 0.01 && typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, pan)), t);
      gain.connect(panner);
      panner.connect(bus);
    } else {
      gain.connect(bus);
    }

    src.start(t);
    return true;
  }

  /** Converts a world X coordinate (0..1280) into a gentle stereo pan (-0.65..+0.65). */
  public worldXToPan(x: number, worldW = 1280): number {
    const norm = (x / Math.max(1, worldW)) * 2 - 1;
    return Math.max(-0.65, Math.min(0.65, norm * 0.65));
  }

  /** Gently lowers ambient ocean/weather & BGM while menus are open so UI feels focused. */
  public setShopDuck(ducked: boolean): void {
    this.shopDucked = ducked;
    if (!this.ctx || !this.ambienceBus) return;
    this.ambienceBus.gain.setTargetAtTime(this.ambienceLevel(), this.ctx.currentTime, 0.25);
    this.applyMusicMix(0.35);
  }

  private masterLevel(): number {
    return this.muted ? 0 : 0.78 * curve(this.volumes.master);
  }

  private ambienceLevel(): number {
    return (this.shopDucked ? 0.48 : 1.0) * (this.voiceDucked ? 0.78 : 1) * curve(this.volumes.ambience);
  }

  /** The volume sliders of the settings, 0..1 each. */
  public setVolumes(v: Volumes): void {
    this.volumes = { ...v };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.masterGain?.gain.setTargetAtTime(this.masterLevel(), now, 0.05);
    this.sfxBus?.gain.setTargetAtTime(curve(v.sfx), now, 0.05);
    this.uiBus?.gain.setTargetAtTime(0.92 * curve(v.ui), now, 0.05);
    this.voiceBus?.gain.setTargetAtTime(curve(v.voice), now, 0.05);
    this.ambienceBus?.gain.setTargetAtTime(this.ambienceLevel(), now, 0.05);
    this.applyMusicMix(0.08);
  }

  /** While someone speaks on the radio the music and the sea step back a little. */
  public setVoiceDuck(on: boolean): void {
    if (this.voiceDucked === on) return;
    this.voiceDucked = on;
    if (!this.ctx) return;
    this.ambienceBus?.gain.setTargetAtTime(this.ambienceLevel(), this.ctx.currentTime, on ? 0.12 : 0.6);
    this.applyMusicMix(on ? 0.12 : 0.6);
  }

  /** Where the radio voices are mixed in, once sound has been unlocked by a tap. */
  public voiceOut(): { ctx: AudioContext; bus: GainNode } | null {
    return this.ctx && this.voiceBus && !this.muted ? { ctx: this.ctx, bus: this.voiceBus } : null;
  }

  /** The audio clock, which only runs while sound can actually be heard. */
  public now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  public get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** How loud the radio is right now, 0..1, for the speaker's mouth. */
  public voiceLevel(): number {
    if (!this.voiceMeter || !this.meterData) return 0;
    this.voiceMeter.getFloatTimeDomainData(this.meterData);
    let sum = 0;
    for (let i = 0; i < this.meterData.length; i++) sum += this.meterData[i] * this.meterData[i];
    const rms = Math.sqrt(sum / this.meterData.length) / Math.max(0.05, curve(this.volumes.voice));
    return Math.min(1, rms * 5.5);
  }

  /** Updates full weather atmosphere from time of day; plays a soft cue on live weather shifts. */
  public setWeather(tod: TimeOfDay, announceTransition = true): void {
    const prev = this.currentTod;
    this.currentTod = tod;
    const nextStorm = tod === 'monsoon' ? 1 : 0;
    const changed = prev !== null && prev !== tod;
    this.stormMix = nextStorm;
    this.music?.setTimeOfDay(tod);
    this.applyAmbienceMix(0.65);

    if (changed && announceTransition && this.ctx && !this.muted) {
      if (tod === 'monsoon') {
        this.playThunder(0.58);
        this.thunderTimer = 9 + Math.random() * 6;
      } else {
        this.playBuffer('weather-shift', {
          volume: 0.34,
          rate: tod === 'dawn' ? 1.06 : tod === 'night' ? 0.86 : tod === 'sunset' ? 0.95 : 1.0,
          bus: 'ambience',
        });
      }
    }
  }

  public setStormAmbience(amount: number): void {
    this.stormMix = Math.max(0, Math.min(1, amount));
    this.applyAmbienceMix(0.5);
  }

  /** Drives dynamic weather ambience events (distant monsoon thunder rolls). Call every frame. */
  public updateWeather(dt: number): void {
    if (!this.ctx || this.muted || this.stormMix < 0.35) return;
    this.thunderTimer -= dt;
    if (this.thunderTimer <= 0) {
      this.thunderTimer = 11 + Math.random() * 9;
      this.playThunder((0.32 + Math.random() * 0.24) * this.stormMix);
    }
  }

  public playThunder(volume = 0.45): void {
    if (!this.ctx || this.muted) return;
    const id: SfxId = Math.random() < 0.5 ? 'thunder-1' : 'thunder-2';
    const pan = (Math.random() - 0.5) * 1.1;
    const rate = 0.88 + Math.random() * 0.2;
    this.playBuffer(id, { volume, rate, pan, bus: 'ambience' });
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.masterLevel(), this.ctx.currentTime, 0.04);
    }
    this.music?.setMuted(this.muted);
    if (muted) this.setWaveCharge(0);
  }

  /* -------------------------------------------------------------- wave charge */

  /** Smoothly modulates the rising ocean swell while the player holds to charge a tidal wave (0..1). */
  public setWaveCharge(level: number): void {
    const k = Math.max(0, Math.min(1, level));
    if (k <= 0.04 && !this.chargeGain && this.chargeLevel <= 0.04) return;
    this.chargeLevel = k;
    if (!this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;

    if (k > 0.04 && !this.muted) {
      if (!this.chargeGain) {
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        filter.Q.value = 1.4;

        const gain = this.ctx.createGain();
        gain.gain.value = 0.0001;

        filter.connect(gain);
        gain.connect(this.sfxBus);

        const buf = this.buffers.get('wave-charge');
        if (buf) {
          const src = this.ctx.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          src.connect(filter);
          src.start();
          this.chargeSource = src;
        } else {
          const osc = this.ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = 130;
          osc.connect(filter);
          osc.start();
          this.chargeOsc = osc;
        }
        this.chargeFilter = filter;
        this.chargeGain = gain;
      }

      const targetGain = this.chargeSource ? 0.04 + k * 0.26 : 0.02 + k * 0.08;
      this.chargeGain.gain.setTargetAtTime(targetGain, now, 0.06);
      this.chargeFilter?.frequency.setTargetAtTime(420 + k * 2400, now, 0.08);
      if (this.chargeSource) {
        this.chargeSource.playbackRate.setTargetAtTime(0.86 + k * 0.44, now, 0.08);
      } else if (this.chargeOsc) {
        this.chargeOsc.frequency.setTargetAtTime(130 + k * 190, now, 0.08);
      }
    } else if (this.chargeGain) {
      const gain = this.chargeGain;
      const src = this.chargeSource;
      const osc = this.chargeOsc;
      const filter = this.chargeFilter;
      this.chargeGain = null;
      this.chargeSource = null;
      this.chargeOsc = null;
      this.chargeFilter = null;
      gain.gain.setTargetAtTime(0.0001, now, 0.05);
      window.setTimeout(() => {
        try {
          src?.stop();
          osc?.stop();
          filter?.disconnect();
          gain.disconnect();
        } catch {
          // Ignore already stopped audio nodes
        }
      }, 220);
    }
  }

  /* -------------------------------------------------------------- procedural helpers */

  private playKalimbaTone(freq: number, duration: number, volume: number, delay = 0, pan = 0): void {
    if (!this.ctx || !this.sfxBus || this.muted) return;
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

    if (Math.abs(pan) > 0.01 && typeof this.ctx.createStereoPanner === 'function') {
      const p = this.ctx.createStereoPanner();
      p.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, pan)), t);
      gain.connect(p);
      p.connect(this.sfxBus);
    } else {
      gain.connect(this.sfxBus);
    }

    osc.start(t);
    harm.start(t);
    osc.stop(t + duration + 0.04);
    harm.stop(t + duration + 0.04);
  }

  private playWaterWhoosh(charge: number, volume = 0.24): void {
    if (!this.ctx || !this.sfxBus || !this.noiseBuffer || this.muted) return;
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
    gain.connect(this.sfxBus);

    src.start(t, Math.random() * 1.2, dur + 0.05);
  }

  /* -------------------------------------------------------------- waves */

  public playWaveLaunch(charge: number, isEcho = false, pan = 0): void {
    this.unlock();
    if (!this.ctx || this.muted) return;

    const c = Math.max(0, Math.min(1, charge));
    const jitter = (Math.random() - 0.5) * 0.08;

    let playedSample = false;
    if (isEcho) {
      playedSample = this.playBuffer('wave-echo', {
        volume: 0.36 + c * 0.14,
        rate: 0.98 + jitter * 1.2,
        pan,
      });
    } else if (c >= 0.38) {
      const heavy = this.playBuffer('wave-heavy', {
        volume: 0.52 + c * 0.34,
        rate: 1.02 - c * 0.1 + jitter * 0.5,
        pan,
      });
      const light = this.playBuffer('wave-light', {
        volume: 0.28 + (1 - c) * 0.2,
        rate: 0.96 + jitter,
        pan,
      });
      playedSample = heavy || light;
    } else {
      playedSample = this.playBuffer('wave-light', {
        volume: 0.48 + c * 0.24,
        rate: 1.04 - c * 0.14 + jitter,
        pan,
      });
    }

    if (!playedSample) {
      this.playWaterWhoosh(c, isEcho ? 0.14 : 0.24);
    }
  }

  /** Soft foaming splash when a player wave reaches the sandy beach. */
  public playShoreSplash(strength = 0.7, pan = -0.52): void {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (now - this.lastShoreSplashMs < 380) return;
    this.lastShoreSplashMs = now;

    const s = Math.max(0.25, Math.min(1.2, strength));
    this.playBuffer('shore-splash', {
      volume: 0.22 + s * 0.2,
      rate: 0.92 + Math.random() * 0.18,
      pan,
    });
  }

  /* -------------------------------------------------------------- trash & combo */

  public playTrashCollect(comboCount: number, rarity: TrashRarity = 'common', pan = -0.35): void {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    // Smooth micro-debounce so mass sweeps cascade musically without clutter
    if ((rarity === 'common' || rarity === 'uncommon') && now - this.lastCollectSfxMs < 50) return;
    this.lastCollectSfxMs = now;

    const idx = Math.min(PENTATONIC.length - 1, Math.max(0, comboCount - 1) % PENTATONIC.length);
    const octaveBoost = comboCount > PENTATONIC.length ? 1.12 : 1.0;
    const freq = PENTATONIC[idx] * (rarity === 'uncommon' ? 1.0 : 1.0);
    // Smooth musical pitch climb across combo streaks (clamped to stay warm & organic)
    const comboPitch = 0.96 + Math.min(14, Math.max(0, comboCount - 1)) * 0.026;
    const jitter = (Math.random() - 0.5) * 0.04;

    if (rarity === 'legendary') {
      const ok = this.playBuffer('trash-legendary', { volume: 0.85, rate: 1.0, pan });
      this.playBuffer('net-catch-1', { volume: 0.38, rate: 1.08, pan });
      if (!ok) {
        this.playKalimbaTone(659.25, 0.55, 0.22, 0, pan);
        this.playKalimbaTone(880.0, 0.6, 0.2, 0.06, pan);
        this.playKalimbaTone(1318.51, 0.7, 0.2, 0.12, pan);
        this.playKalimbaTone(1567.98, 0.85, 0.18, 0.18, pan);
      }
      return;
    }

    if (rarity === 'epic') {
      const ok = this.playBuffer('trash-epic', { volume: 0.76, rate: 0.99 + jitter, pan });
      this.playBuffer('net-catch-2', { volume: 0.32, rate: 1.05, pan });
      if (!ok) {
        this.playKalimbaTone(587.33, 0.42, 0.2, 0, pan);
        this.playKalimbaTone(880.0, 0.5, 0.18, 0.05, pan);
        this.playKalimbaTone(1174.66, 0.6, 0.16, 0.11, pan);
      }
      return;
    }

    if (rarity === 'rare') {
      const ok = this.playBuffer('trash-rare', {
        volume: 0.68,
        rate: Math.min(1.22, 0.98 + Math.min(8, comboCount) * 0.018 + jitter),
        pan,
      });
      if (ok) {
        this.playKalimbaTone(freq * octaveBoost, 0.26, 0.08, 0.02, pan);
      } else {
        this.playKalimbaTone(freq, 0.36, 0.19, 0, pan);
        this.playKalimbaTone(freq * 1.5, 0.42, 0.14, 0.045, pan);
      }
      return;
    }

    // Common & Uncommon: alternate two woven-net catch samples + escalating combo harmonic
    this.catchToggle = (this.catchToggle + 1) % 2;
    const catchId: SfxId = this.catchToggle === 0 ? 'net-catch-1' : 'net-catch-2';
    const ok = this.playBuffer(catchId, {
      volume: rarity === 'uncommon' ? 0.62 : 0.54,
      rate: comboPitch + jitter + (rarity === 'uncommon' ? 0.04 : 0),
      pan,
    });

    if (ok) {
      // Musical pentatonic sparkle climbs with combo count so streaks sing!
      this.playKalimbaTone(freq, 0.22, rarity === 'uncommon' ? 0.1 : 0.075, 0.01, pan);
      if (rarity === 'uncommon' || comboCount >= 6) {
        this.playKalimbaTone(freq * 1.5, 0.18, 0.05, 0.035, pan);
      }
    } else {
      this.playKalimbaTone(freq, 0.26, 0.16, 0, pan);
      this.playKalimbaTone(freq * 1.25, 0.2, 0.07, 0.03, pan);
    }
  }

  /** Celebratory combo milestone cue at 5, 10, 15, 20... consecutive catches. */
  public playComboMilestone(comboCount: number): void {
    if (!this.ctx || this.muted) return;
    const tier = Math.max(1, Math.floor(comboCount / 5));
    const rate = Math.min(1.26, 0.96 + (tier - 1) * 0.06);
    const ok = this.playBuffer('combo-milestone', {
      volume: Math.min(0.76, 0.56 + tier * 0.04),
      rate,
      pan: -0.2,
    });
    if (!ok) {
      this.playKalimbaTone(659.25 * rate, 0.28, 0.15, 0);
      this.playKalimbaTone(987.77 * rate, 0.35, 0.14, 0.06);
    }
  }

  /** Soft, cozy cue when a meaningful combo streak (>= 5) gently expires. */
  public playComboBreak(lostCombo: number): void {
    if (!this.ctx || this.muted || lostCombo < 5) return;
    const ok = this.playBuffer('combo-break', {
      volume: 0.3,
      rate: 0.98,
      pan: -0.2,
    });
    if (!ok) {
      this.playKalimbaTone(440, 0.16, 0.08, 0);
      this.playKalimbaTone(329.63, 0.22, 0.07, 0.07);
    }
  }

  /* -------------------------------------------------------------- progression & UI */

  public playShopUnlock(): void {
    if (!this.ctx || this.muted) return;
    if (this.playBuffer('shop-unlock', { volume: 0.72, bus: 'ui' })) return;
    this.playKalimbaTone(523.25, 0.4, 0.18, 0);
    this.playKalimbaTone(659.25, 0.45, 0.18, 0.07);
    this.playKalimbaTone(1046.5, 0.65, 0.2, 0.14);
  }

  public playUpgradeBuy(): void {
    this.unlock();
    if (!this.ctx || this.muted) return;
    if (
      this.playBuffer('upgrade-buy', {
        volume: 0.68,
        rate: 0.98 + Math.random() * 0.05,
        bus: 'ui',
      })
    ) {
      return;
    }
    this.playKalimbaTone(587.33, 0.28, 0.2, 0);
    this.playKalimbaTone(880.0, 0.4, 0.2, 0.06);
  }

  public playUiClick(): void {
    this.unlock();
    if (!this.ctx || this.muted) return;
    if (
      this.playBuffer('ui-click', {
        volume: 0.46,
        rate: 0.97 + Math.random() * 0.07,
        bus: 'ui',
      })
    ) {
      return;
    }
    this.playUiBlip(1180, 0.05, 0.1);
  }

  /** The pointer reaches a button: a small soft blip, never more than one at a time. */
  public playUiHover(): void {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = performance.now();
    if (now - this.lastHoverMs < 45) return;
    this.lastHoverMs = now;
    if (this.playBuffer('ui-hover', { volume: 0.2, rate: 0.98 + Math.random() * 0.08, bus: 'ui' })) return;
    this.playUiBlip(880, 0.04, 0.05);
  }

  /** A short sine blip for when a UI sample has not arrived yet. */
  private playUiBlip(freq: number, length: number, volume: number): void {
    if (!this.ctx || !this.uiBus) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.82, t + length);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(g);
    g.connect(this.uiBus);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }

  /** The radio opens before someone speaks, and clicks shut after. */
  public playRadioIn(): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('radio-in', { volume: 0.32, rate: 0.96 + Math.random() * 0.08, bus: 'voice' });
  }

  public playRadioOut(): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('radio-out', { volume: 0.22, rate: 0.96 + Math.random() * 0.08, bus: 'voice' });
  }

  public playUiTab(): void {
    this.unlock();
    if (!this.ctx || this.muted) return;
    if (
      this.playBuffer('ui-tab', {
        volume: 0.52,
        rate: 0.98 + Math.random() * 0.05,
        bus: 'ui',
      })
    ) {
      return;
    }
    this.playKalimbaTone(659.25, 0.11, 0.11, 0);
    this.playKalimbaTone(987.77, 0.14, 0.09, 0.03);
  }

  public playUiOpen(): void {
    this.unlock();
    if (!this.ctx || this.muted) return;
    if (this.playBuffer('ui-open', { volume: 0.54, bus: 'ui' })) return;
    this.playKalimbaTone(523.25, 0.16, 0.12, 0);
    this.playKalimbaTone(783.99, 0.22, 0.13, 0.045);
  }

  public playUiClose(): void {
    if (!this.ctx || this.muted) return;
    if (this.playBuffer('ui-close', { volume: 0.5, bus: 'ui' })) return;
    this.playKalimbaTone(659.25, 0.14, 0.1, 0);
    this.playKalimbaTone(440.0, 0.18, 0.1, 0.04);
  }

  public playUiError(): void {
    if (!this.ctx || !this.uiBus || this.muted) return;
    if (this.playBuffer('ui-error', { volume: 0.54, bus: 'ui' })) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.14);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g);
    g.connect(this.uiBus);
    osc.start(t);
    osc.stop(t + 0.17);
  }

  public playAchievementClaim(): void {
    this.unlock();
    if (!this.ctx || this.muted) return;
    if (this.playBuffer('achievement-claim', { volume: 0.74, bus: 'ui' })) return;
    this.playKalimbaTone(523.25, 0.3, 0.19, 0);
    this.playKalimbaTone(659.25, 0.35, 0.19, 0.06);
    this.playKalimbaTone(783.99, 0.42, 0.2, 0.12);
    this.playKalimbaTone(1046.5, 0.65, 0.22, 0.18);
  }

  /* -------------------------------------------------------------- lagoon world */

  public playMangrovePlant(pan = -0.5): void {
    if (!this.ctx || this.muted) return;
    if (
      this.playBuffer('mangrove-plant', {
        volume: 0.72,
        rate: 0.96 + Math.random() * 0.09,
        pan,
      })
    ) {
      return;
    }
    this.playKalimbaTone(392.0, 0.45, 0.2, 0, pan);
    this.playKalimbaTone(523.25, 0.5, 0.18, 0.07, pan);
    this.playKalimbaTone(659.25, 0.6, 0.18, 0.14, pan);
    this.playKalimbaTone(783.99, 0.75, 0.15, 0.21, pan);
  }

  public playBoatSaved(pan = -0.45): void {
    if (!this.ctx || this.muted) return;
    if (this.playBuffer('boat-saved', { volume: 0.74, rate: 0.98 + Math.random() * 0.05, pan })) {
      return;
    }
    this.playKalimbaTone(261.63, 0.55, 0.22, 0, pan);
    this.playKalimbaTone(392.0, 0.6, 0.2, 0.08, pan);
    this.playKalimbaTone(523.25, 0.75, 0.22, 0.16, pan);
    this.playKalimbaTone(659.25, 0.9, 0.16, 0.24, pan);
  }

  public playFireDouse(pan = -0.55): void {
    if (!this.ctx || !this.sfxBus || this.muted) return;
    if (this.playBuffer('fire-douse', { volume: 0.74, rate: 0.96 + Math.random() * 0.08, pan })) {
      return;
    }
    if (!this.noiseBuffer) return;
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
    g.connect(this.sfxBus);
    src.start(t, 0.2, 0.6);

    this.playKalimbaTone(659.25, 0.4, 0.16, 0.06, pan);
    this.playKalimbaTone(880.0, 0.45, 0.16, 0.13, pan);
    this.playKalimbaTone(1318.51, 0.6, 0.15, 0.2, pan);
  }

  public playResonanceBurst(pan = 0): void {
    if (!this.ctx || !this.sfxBus || this.muted) return;
    const t = this.ctx.currentTime;

    // Tactile sub-bass drop beneath the ElevenLabs harmonic burst
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(155, t);
    sub.frequency.exponentialRampToValueAtTime(52, t + 0.42);
    subGain.gain.setValueAtTime(0.24, t);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
    sub.connect(subGain);
    subGain.connect(this.sfxBus);
    sub.start(t);
    sub.stop(t + 0.5);

    if (
      this.playBuffer('resonance-burst', {
        volume: 0.78,
        rate: 0.97 + Math.random() * 0.06,
        pan,
      })
    ) {
      return;
    }

    this.playKalimbaTone(523.25, 0.65, 0.2, 0, pan);
    this.playKalimbaTone(783.99, 0.75, 0.18, 0.03, pan);
    this.playKalimbaTone(1046.5, 0.9, 0.16, 0.07, pan);
    this.playWaterWhoosh(0.95, 0.26);
  }

  public playTrawlerHit(pan = 0.4): void {
    if (!this.ctx || !this.sfxBus || this.muted) return;
    if (
      this.playBuffer('trawler-hit', {
        volume: 0.78,
        rate: 0.93 + Math.random() * 0.14,
        pan,
      })
    ) {
      return;
    }
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.26);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.32);
    this.playWaterWhoosh(0.7, 0.2);
  }

  /** The opening's outboard: a buzzing two-stroke hum, 0..1. Built on demand, torn down when it goes quiet. */
  public setMotor(level: number): void {
    if (!this.ctx || !this.sfxBus) return;
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
        out.connect(this.sfxBus);
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
  public playSplash(strength = 1, pan = 0): void {
    if (!this.ctx || !this.sfxBus || this.muted) return;
    if (
      this.playBuffer('splash', {
        volume: Math.min(0.85, 0.52 * strength),
        rate: 0.92 + Math.random() * 0.18,
        pan,
      })
    ) {
      return;
    }
    if (!this.noiseBuffer) return;
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
    g.connect(this.sfxBus);
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
    og.connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.18);
  }

  /** Something thrown: a quick rising swish of air. */
  public playToss(): void {
    if (!this.ctx || !this.sfxBus || !this.noiseBuffer || this.muted) return;
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
    g.connect(this.sfxBus);
    src.start(t, Math.random() * 2, 0.22);
  }

  /* ------------------------------------------------------------------ birds */

  /**
   * Birdsong for this moment, called every frame. `level` 0 is silence and 1 a busy morning; it sets
   * how often something sings. `gulls` is how much of it comes from the sea rather than the forest.
   */
  public updateBirds(dt: number, level: number, gulls = 0.3): void {
    if (!this.ctx || !this.ambienceBus || this.muted) return;
    this.birdT -= dt;
    if (this.birdT > 0) return;
    const lv = Math.max(0, Math.min(1, level));
    if (lv < 0.03) {
      this.birdT = 0.8;
      return;
    }
    // a quiet lagoon gets a call every seven seconds or so, a lively one every couple of seconds
    this.birdT = (7.8 - lv * 5.6) * (0.6 + Math.random() * 0.85);
    if (Math.random() < gulls * 0.45) this.playGull();
    else this.playSongbird(lv);
  }

  /** A few birds at once: the forest answering a mangrove, a rescue, a win. */
  public playBirdBurst(strength = 1): void {
    if (!this.ctx || this.muted) return;
    const n = 2 + Math.round(strength * 2);
    for (let i = 0; i < n; i++) this.playSongbird(1, i * 0.28 + Math.random() * 0.14);
    this.birdT = Math.max(this.birdT, 2.4);
  }

  /** One sliding note: procedural fallback for birdsong. */
  private chirp(t: number, freqs: number[], dur: number, vol: number, pan: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freqs[0], t);
    for (let i = 1; i < freqs.length; i++) {
      o.frequency.exponentialRampToValueAtTime(freqs[i], t + (dur * i) / (freqs.length - 1));
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.014, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.ambienceBus!);
    } else {
      g.connect(this.ambienceBus!);
    }
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Something small in the trees: the forest is on the left of the screen, so it sings from the left. */
  private playSongbird(level: number, delay = 0): void {
    if (!this.ctx || !this.ambienceBus) return;
    const pan = -0.25 - Math.random() * 0.55;
    const sampleId: SfxId = Math.random() < 0.55 ? 'bird-tropical-1' : 'bird-tropical-2';
    if (
      this.playBuffer(sampleId, {
        volume: 0.22 + Math.random() * 0.12 + level * 0.06,
        rate: 0.92 + Math.random() * 0.2,
        pan,
        delay,
        bus: 'ambience',
      })
    ) {
      return;
    }

    const t = this.ctx.currentTime + 0.02 + delay;
    const vol = 0.065 + Math.random() * 0.03;
    const kind = Math.floor(Math.random() * (level > 0.55 ? 4 : 3));
    if (kind === 0) {
      const n = 2 + Math.floor(Math.random() * 3);
      const f = 2600 + Math.random() * 900;
      for (let i = 0; i < n; i++) this.chirp(t + i * 0.13, [f, f * 1.45], 0.07, vol, pan);
    } else if (kind === 1) {
      const f = 3400 + Math.random() * 800;
      for (let i = 0; i < 9; i++) {
        const k = f * (1 - i * 0.014);
        this.chirp(t + i * 0.036, [k, k * 0.9], 0.03, vol * 0.8, pan);
      }
    } else if (kind === 2) {
      const f = 1800 + Math.random() * 500;
      this.chirp(t, [f * 1.2, f], 0.18, vol, pan);
      this.chirp(t + 0.24, [f * 0.9, f * 1.35], 0.22, vol, pan);
    } else {
      const f = 720 + Math.random() * 80;
      for (let i = 0; i < 3; i++) {
        this.chirp(t + i * 0.55, [f * (1 + i * 0.08), f * (1.42 + i * 0.1)], 0.34, vol * 1.15, pan, 'triangle');
      }
    }
  }

  /** A gull calling over the water, from the sea side of the screen. */
  private playGull(): void {
    if (!this.ctx || !this.ambienceBus) return;
    const pan = 0.25 + Math.random() * 0.55;
    if (
      this.playBuffer('seagull', {
        volume: 0.2 + Math.random() * 0.1,
        rate: 0.92 + Math.random() * 0.16,
        pan,
        bus: 'ambience',
      })
    ) {
      return;
    }

    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const n = 2 + Math.floor(Math.random() * 2);
    const out = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    if (out) {
      out.pan.value = pan;
      out.connect(this.ambienceBus);
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
      g.connect(out ?? this.ambienceBus);
      o.start(s);
      o.stop(s + 0.28);
    }
  }

  /* ------------------------------------------------------------------ the dolphin */

  /** Dolphin whistles: `distress` is a wavering upsweep with clicks, `happy` a run of bright chirps. */
  public playDolphin(mood: 'distress' | 'happy'): void {
    if (!this.ctx || !this.sfxBus || this.muted) return;
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
      g.connect(this.sfxBus);
      o.start(s);
      lfo.start(s);
      o.stop(s + dur + 0.02);
      lfo.stop(s + dur + 0.02);
    }
    if (distress && this.noiseBuffer) {
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
        g.connect(this.sfxBus);
        src.start(s, Math.random() * 2, 0.015);
      }
    }
  }

  /** Netting giving way: a sharp tear and a thump in the water. */
  public playNetSnap(strength = 1): void {
    if (!this.ctx || !this.sfxBus || this.muted) return;
    if (
      this.playBuffer('net-snap', {
        volume: Math.min(0.85, 0.62 * strength),
        rate: 0.96 + Math.random() * 0.08,
        pan: 0.25,
      })
    ) {
      this.playKalimbaTone(783.99, 0.28, 0.09, 0.06, 0.25);
      this.playKalimbaTone(1046.5, 0.34, 0.08, 0.11, 0.25);
      return;
    }
    if (!this.noiseBuffer) return;
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
    g.connect(this.sfxBus);
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
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) =>
      this.playKalimbaTone(f, 0.7 + i * 0.08, 0.17, i * 0.075)
    );
  }

  public playVictory(): void {
    if (!this.ctx || this.muted) return;
    if (this.playBuffer('victory', { volume: 0.8, bus: 'ui' })) return;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
    notes.forEach((f, i) => this.playKalimbaTone(f, 1.1, 0.2, i * 0.09));
  }

  public playDefeat(): void {
    if (!this.ctx || this.muted) return;
    const notes = [392.0, 349.23, 311.13, 261.63];
    notes.forEach((f, i) => this.playKalimbaTone(f, 0.85, 0.2, i * 0.14));
  }
}
