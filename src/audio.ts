import { MusicPlayer } from './music';
import { DEFAULT_SETTINGS, type Volumes } from './settings';
import type { TimeOfDay, TrashRarity } from './types';

/**
 * ALUN's sound. Every sound is a recording made with ElevenLabs (scripts/generate-sfx.mjs for the
 * effects, scripts/generate-music.mjs for the music); nothing is synthesized here. Web Audio mixes
 * them: buses per settings channel, pan from where things happen in the lagoon, pitch and volume
 * from how hard or how far into a combo, and the weather's loops under it all.
 *
 * New recordings are levelled by the generator to one loudness, so their volumes below compare
 * directly. The older ones keep the level they were tuned at.
 */

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
  | 'charge-full'
  | 'wave-hit'
  | 'shore-splash'
  | 'net-catch-1'
  | 'net-catch-2'
  | 'coin'
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
  | 'blip-alun'
  | 'blip-low'
  | 'blip-mid'
  | 'mangrove-plant'
  | 'boat-saved'
  | 'boat-motor'
  | 'fire-douse'
  | 'trawler-hit'
  | 'splash'
  | 'toss'
  | 'net-snap'
  | 'alert'
  | 'alun-wake'
  | 'defeat'
  | 'dolphin-distress'
  | 'dolphin-happy'
  | 'pier-hit'
  | 'ship-hit'
  | 'ship-sink'
  | 'raid-horn'
  | 'bird-tropical-1'
  | 'bird-tropical-2'
  | 'seagull'
  | 'victory';

export type BlipId = 'blip-alun' | 'blip-low' | 'blip-mid';

/** Needed from the first touch: the sea, the menus, the wave, the net. */
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
  'blip-alun',
  'blip-low',
  'blip-mid',
  'wave-light',
  'wave-heavy',
  'wave-echo',
  'wave-charge',
  'charge-full',
  'wave-hit',
  'net-catch-1',
  'net-catch-2',
  'coin',
  'combo-milestone',
  'combo-break',
  'shore-splash',
  'toss',
  'splash',
  'boat-motor',
  'alun-wake',
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
  'upgrade-buy',
  'shop-unlock',
  'achievement-claim',
  'mangrove-plant',
  'boat-saved',
  'fire-douse',
  'trawler-hit',
  'net-snap',
  'alert',
  'defeat',
  'dolphin-distress',
  'dolphin-happy',
  'pier-hit',
  'ship-hit',
  'ship-sink',
  'raid-horn',
  'bird-tropical-1',
  'bird-tropical-2',
  'seagull',
  'victory',
];

/**
 * Each catch of a combo rings the coin one step higher: D major pentatonic by day, under the day's
 * music in D major, and D minor pentatonic at night and in the storm, whose music is in D minor.
 */
const SCALE_MAJOR = [1, 1.1225, 1.2599, 1.4983, 1.6818, 2, 2.245, 2.5198];
const SCALE_MINOR = [1, 1.1892, 1.3348, 1.4983, 1.7818, 2, 2.3784, 2.6697];
const COIN_BASE_RATE = 0.78;

interface PlayOptions {
  volume?: number;
  rate?: number;
  pan?: number;
  delay?: number;
  bus?: 'sfx' | 'ui' | 'ambience' | 'voice';
}

/** Slider position to gain: half way sounds about half as loud. */
const curve = (v: number): number => v * v;

const jitter = (amount: number): number => (Math.random() - 0.5) * amount;

interface AmbienceTargets {
  ocean: number;
  wind: number;
  rain: number;
  oceanFilterHz: number;
}

interface LoopVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export class TropicalAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private uiBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  /** People on the radio: their clips, babble and squelch. */
  private voiceBus: GainNode | null = null;
  private voiceMeter: AnalyserNode | null = null;
  private meterData: Float32Array<ArrayBuffer> | null = null;
  private volumes: Volumes = { ...DEFAULT_SETTINGS.volume };
  /** A line is being spoken: music and weather step back. */
  private voiceDucked = false;

  private music: MusicPlayer | null = null;

  // the weather's loops, started as soon as each one has been decoded
  private oceanLoopGain: GainNode | null = null;
  private oceanLoopFilter: BiquadFilterNode | null = null;
  private rainLoopGain: GainNode | null = null;
  private windLoopGain: GainNode | null = null;

  // the swell that builds while a wave is held
  private charge: (LoopVoice & { filter: BiquadFilterNode }) | null = null;
  private chargeLevel = 0;

  // the opening's outboard
  private motor: LoopVoice | null = null;
  private motorStop: number | null = null;

  private buffers = new Map<SfxId, AudioBuffer>();
  private loadingStarted = false;

  private muted = false;
  private initialized = false;
  private shopDucked = false;
  private stormMix = 0;
  private currentTod: TimeOfDay | null = null;
  private thunderTimer = 4.5;
  private birdT = 1.6;
  private catchToggle = 0;
  /** When each kind of quick, frequent sound last played, so a flurry does not turn into noise. */
  private last = new Map<string, number>();

  private openingMusic = false;
  private musicHeld = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public unlock(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    // gentle master compression keeps dense sweeps and storms warm and clip-free
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
    this.ambienceBus.gain.value = 0;
    this.ambienceBus.gain.setTargetAtTime(this.ambienceLevel(), ctx.currentTime, 1.1);

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
      else if (id === 'rain-monsoon') this.rainLoopGain = this.startLoop(decoded);
      else if (id === 'storm-wind') this.windLoopGain = this.startLoop(decoded);
    } catch {
      // a sound that cannot be fetched or decoded stays silent; nothing stands in for it
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
    if (tod === 'night') return { ocean: 0.34, wind: 0.14, rain: 0.0001, oceanFilterHz: 2100 };
    if (tod === 'sunset') return { ocean: 0.36, wind: 0.15, rain: 0.0001, oceanFilterHz: 2400 };
    if (tod === 'dawn') return { ocean: 0.32, wind: 0.06, rain: 0.0001, oceanFilterHz: 3200 };
    if (tod === 'noon') return { ocean: 0.35, wind: 0.09, rain: 0.0001, oceanFilterHz: 3000 };
    return { ocean: 0.33, wind: 0.05, rain: 0.0001, oceanFilterHz: 2800 };
  }

  private applyAmbienceMix(timeConstant = 0.55): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const targets = this.getAmbienceTargets();
    this.oceanLoopGain?.gain.setTargetAtTime(targets.ocean, now, timeConstant);
    this.oceanLoopFilter?.frequency.setTargetAtTime(targets.oceanFilterHz, now, timeConstant);
    this.rainLoopGain?.gain.setTargetAtTime(targets.rain, now, timeConstant);
    this.windLoopGain?.gain.setTargetAtTime(targets.wind, now, timeConstant);
    this.applyMusicMix(timeConstant);
  }

  private startMusic(): void {
    if (this.music || !this.ctx || !this.musicFilter) return;
    this.music = new MusicPlayer(this.ctx, this.musicFilter);
    this.music.setTimeOfDay(this.openingMusic ? 'sunset' : this.currentTod ?? 'morning');
    this.music.start();
    this.applyMusicMix(1.1);
  }

  public setOpeningMusic(on: boolean): void {
    this.openingMusic = on;
    this.music?.setTimeOfDay(on ? 'sunset' : this.currentTod ?? 'morning');
    this.applyMusicMix();
  }

  public holdMusic(held: boolean): void {
    this.musicHeld = held;
    this.applyMusicMix(held ? 0.2 : 0.6);
  }

  public setPaused(paused: boolean): void {
    this.music?.setPaused(paused);
  }

  private applyMusicMix(timeConstant = 0.55): void {
    if (!this.ctx || !this.musicBus || !this.musicFilter) return;
    const now = this.ctx.currentTime;
    const isNight = this.currentTod === 'night';
    const baseGain = this.stormMix > 0.05 ? 0.4 : isNight ? 0.42 : 0.44;
    const targetGain = (this.shopDucked ? baseGain * 0.48 : baseGain) * curve(this.volumes.music) * (this.voiceDucked ? 0.6 : 1);
    const targetHz = this.shopDucked ? 2200 : 18000;
    this.musicBus.gain.setTargetAtTime(this.musicHeld ? 0 : targetGain * (this.openingMusic ? 0.65 : 1), now, timeConstant);
    this.musicFilter.frequency.setTargetAtTime(targetHz, now, timeConstant);
  }

  private startOceanLoop(buffer: AudioBuffer): void {
    if (!this.ctx || !this.ambienceBus || this.oceanLoopGain) return;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2800;
    filter.Q.value = 0.5;
    filter.connect(this.ambienceBus);
    this.oceanLoopFilter = filter;
    this.oceanLoopGain = this.startLoop(buffer, filter);
  }

  /** A weather loop, silent until the mix asks for it. */
  private startLoop(buffer: AudioBuffer, into: AudioNode | null = this.ambienceBus): GainNode | null {
    if (!this.ctx || !into) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;
    src.connect(gain);
    gain.connect(into);
    src.start();
    // the mix is set right after this gain is kept
    queueMicrotask(() => this.applyAmbienceMix(0.8));
    return gain;
  }

  private busFor(bus: PlayOptions['bus']): GainNode | null {
    return bus === 'ui' ? this.uiBus : bus === 'ambience' ? this.ambienceBus : bus === 'voice' ? this.voiceBus : this.sfxBus;
  }

  private playBuffer(id: SfxId, opts: PlayOptions = {}): boolean {
    if (!this.ctx || this.muted) return false;
    const buffer = this.buffers.get(id);
    const bus = this.busFor(opts.bus);
    if (!buffer || !bus) return false;

    const t = this.ctx.currentTime + (opts.delay ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    if (opts.rate && opts.rate !== 1) src.playbackRate.setValueAtTime(opts.rate, t);

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

  /** True when `key` has not played for `ms`: marks it as played now. */
  private ready(key: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.last.get(key) ?? -Infinity) < ms) return false;
    this.last.set(key, now);
    return true;
  }

  /** Converts a world X coordinate (0..1280) into a gentle stereo pan (-0.65..+0.65). */
  public worldXToPan(x: number, worldW = 1280): number {
    const norm = (x / Math.max(1, worldW)) * 2 - 1;
    return Math.max(-0.65, Math.min(0.65, norm * 0.65));
  }

  /** Gently lowers the sea, the weather and the music while menus are open so the UI feels focused. */
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

  /** Weather and music follow the time of day; a live change of weather is marked by a soft cue. */
  public setWeather(tod: TimeOfDay, announceTransition = true): void {
    const prev = this.currentTod;
    this.currentTod = tod;
    this.music?.setTimeOfDay(this.openingMusic ? 'sunset' : tod);
    if (prev === tod) return;
    this.stormMix = tod === 'monsoon' ? 1 : 0;
    this.applyAmbienceMix(0.65);

    if (prev !== null && announceTransition && this.ctx && !this.muted) {
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

  /** Distant monsoon thunder rolls. Call every frame. */
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
    this.playBuffer(id, { volume, rate: 0.88 + Math.random() * 0.2, pan: jitter(1.1), bus: 'ambience' });
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
    if (muted) this.setWaveCharge(0);
  }

  /* ------------------------------------------------------------------ the wave */

  /** The swell rises while the player holds to charge a wave (0..1). */
  public setWaveCharge(level: number): void {
    const k = Math.max(0, Math.min(1, level));
    if (k <= 0.04 && !this.charge && this.chargeLevel <= 0.04) return;
    this.chargeLevel = k;
    if (!this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;

    if (k > 0.04 && !this.muted) {
      if (!this.charge) {
        const buf = this.buffers.get('wave-charge');
        if (!buf) return;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        filter.Q.value = 1.4;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.0001;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxBus);
        src.start();
        this.charge = { src, gain, filter };
      }
      this.charge.gain.gain.setTargetAtTime(0.04 + k * 0.26, now, 0.06);
      this.charge.filter.frequency.setTargetAtTime(420 + k * 2400, now, 0.08);
      this.charge.src.playbackRate.setTargetAtTime(0.86 + k * 0.44, now, 0.08);
    } else if (this.charge) {
      const { src, gain, filter } = this.charge;
      this.charge = null;
      gain.gain.setTargetAtTime(0.0001, now, 0.05);
      window.setTimeout(() => {
        try {
          src.stop();
          filter.disconnect();
          gain.disconnect();
        } catch {
          // already stopped
        }
      }, 220);
    }
  }

  /** The held wave has all the power it can take. */
  public playChargeFull(): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('charge-full', { volume: 0.42, rate: 1 + jitter(0.04) });
  }

  public playWaveLaunch(charge: number, isEcho = false, pan = 0): void {
    this.unlock();
    if (!this.ctx || this.muted) return;
    const c = Math.max(0, Math.min(1, charge));
    const j = jitter(0.08);
    if (isEcho) {
      this.playBuffer('wave-echo', { volume: 0.36 + c * 0.14, rate: 0.98 + j * 1.2, pan });
    } else if (c >= 0.38) {
      this.playBuffer('wave-heavy', { volume: 0.52 + c * 0.34, rate: 1.02 - c * 0.1 + j * 0.5, pan });
      this.playBuffer('wave-light', { volume: 0.28 + (1 - c) * 0.2, rate: 0.96 + j, pan });
    } else {
      this.playBuffer('wave-light', { volume: 0.48 + c * 0.24, rate: 1.04 - c * 0.14 + j, pan });
    }
  }

  /** A wave slaps into something floating. Light pieces sound higher than heavy ones. */
  public playWaveHit(strength: number, mass = 1, pan = 0): void {
    if (!this.ctx || this.muted || !this.ready('wave-hit', 55)) return;
    const s = Math.max(0.2, Math.min(1.3, strength));
    this.playBuffer('wave-hit', {
      volume: 0.1 + s * 0.13,
      rate: (1.18 - Math.min(0.4, (mass - 0.8) * 0.5)) * (1 + jitter(0.16)),
      pan,
    });
  }

  /** Soft foaming splash when a player wave reaches the sandy beach. */
  public playShoreSplash(strength = 0.7, pan = -0.52): void {
    if (!this.ctx || this.muted || !this.ready('shore', 380)) return;
    const s = Math.max(0.25, Math.min(1.2, strength));
    this.playBuffer('shore-splash', { volume: 0.22 + s * 0.2, rate: 0.92 + Math.random() * 0.18, pan });
  }

  /* ------------------------------------------------------------------ the net, coins and combos */

  /** The coin a catch pays: a step up the scale for each catch of the combo running. */
  private playComboCoin(comboCount: number, volume: number, pan: number, delay = 0.015): void {
    const scale = this.currentTod === 'night' || this.currentTod === 'monsoon' ? SCALE_MINOR : SCALE_MAJOR;
    const step = Math.min(scale.length - 1, Math.max(0, comboCount - 1));
    // past the top of the scale the coin keeps ringing there, with a little shimmer of its own
    const over = comboCount > scale.length ? 1 + jitter(0.03) : 1;
    this.playBuffer('coin', { volume, rate: COIN_BASE_RATE * scale[step] * over, pan, delay });
  }

  public playTrashCollect(comboCount: number, rarity: TrashRarity = 'common', pan = -0.35): void {
    if (!this.ctx || this.muted) return;
    const common = rarity === 'common' || rarity === 'uncommon';
    // a sweep that lands many at once rings out as a run, not a pile-up
    if (common && !this.ready('catch', 50)) return;

    if (rarity === 'legendary') {
      this.playBuffer('trash-legendary', { volume: 0.85, pan });
      this.playBuffer('net-catch-1', { volume: 0.26, rate: 0.94, pan });
      this.playComboCoin(comboCount, 0.34, pan, 0.03);
      return;
    }
    if (rarity === 'epic') {
      this.playBuffer('trash-epic', { volume: 0.72, rate: 0.99 + jitter(0.04), pan });
      this.playBuffer('net-catch-2', { volume: 0.28, rate: 0.96, pan });
      this.playComboCoin(comboCount, 0.32, pan, 0.03);
      return;
    }
    if (rarity === 'rare') {
      this.playBuffer('trash-rare', { volume: 0.64, rate: Math.min(1.18, 0.98 + Math.min(8, comboCount) * 0.016 + jitter(0.04)), pan });
      this.playComboCoin(comboCount, 0.3, pan, 0.02);
      return;
    }

    // the net takes it in with a plop, the two takes in turn so a run does not repeat itself
    this.catchToggle = (this.catchToggle + 1) % 2;
    const net: SfxId = this.catchToggle === 0 ? 'net-catch-1' : 'net-catch-2';
    this.playBuffer(net, {
      volume: (net === 'net-catch-1' ? 0.29 : 0.32) * (rarity === 'uncommon' ? 1.12 : 1),
      rate: 0.98 + jitter(0.08) + (rarity === 'uncommon' ? -0.05 : 0),
      pan,
    });
    this.playComboCoin(comboCount, rarity === 'uncommon' ? 0.3 : 0.26, pan);
  }

  /** A coin landing in the purse at the top of the screen. */
  public playCoin(): void {
    if (!this.ctx || this.muted || !this.ready('coin-hud', 45)) return;
    this.playBuffer('coin', { volume: 0.12, rate: 1.5 + Math.random() * 0.25, bus: 'ui' });
  }

  /** Every fifth catch in a row: coins spill. Higher and brighter the longer the run. */
  public playComboMilestone(comboCount: number): void {
    if (!this.ctx || this.muted) return;
    const tier = Math.max(1, Math.floor(comboCount / 5));
    this.playBuffer('combo-milestone', {
      volume: Math.min(0.85, 0.66 + tier * 0.04),
      rate: Math.min(1.22, 0.96 + (tier - 1) * 0.05),
      pan: -0.2,
    });
  }

  /** A combo worth keeping (5 or more) runs out. */
  public playComboBreak(lostCombo: number): void {
    if (!this.ctx || this.muted || lostCombo < 5) return;
    this.playBuffer('combo-break', { volume: 0.3, rate: 0.98, pan: -0.2 });
  }

  /* ------------------------------------------------------------------ menus and progress */

  public playShopUnlock(): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('shop-unlock', { volume: 0.72, bus: 'ui' });
  }

  public playUpgradeBuy(): void {
    this.unlock();
    if (!this.ctx || this.muted) return;
    this.playBuffer('upgrade-buy', { volume: 0.68, rate: 0.98 + Math.random() * 0.05, bus: 'ui' });
    // the coins it cost go out of the purse
    this.playBuffer('coin', { volume: 0.16, rate: 1.05, bus: 'ui' });
    this.playBuffer('coin', { volume: 0.12, rate: 0.94, bus: 'ui', delay: 0.07 });
  }

  public playUiClick(): void {
    this.unlock();
    if (!this.ctx || this.muted) return;
    this.playBuffer('ui-click', { volume: 0.46, rate: 0.97 + Math.random() * 0.07, bus: 'ui' });
  }

  /** The pointer reaches a button: a small soft blip, never more than one at a time. */
  public playUiHover(): void {
    if (!this.ctx || this.muted || this.ctx.state !== 'running' || !this.ready('hover', 45)) return;
    this.playBuffer('ui-hover', { volume: 0.2, rate: 0.98 + Math.random() * 0.08, bus: 'ui' });
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

  /** One syllable of a speaker's babble on the radio, at the pitch given. */
  public playBlip(id: BlipId, rate: number, volume: number): void {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    this.playBuffer(id, { volume, rate, bus: 'voice' });
  }

  public playUiTab(): void {
    this.unlock();
    if (!this.ctx || this.muted) return;
    this.playBuffer('ui-tab', { volume: 0.52, rate: 0.98 + Math.random() * 0.05, bus: 'ui' });
  }

  public playUiOpen(): void {
    this.unlock();
    if (!this.ctx || this.muted) return;
    this.playBuffer('ui-open', { volume: 0.54, bus: 'ui' });
  }

  public playUiClose(): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('ui-close', { volume: 0.5, bus: 'ui' });
  }

  public playUiError(): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('ui-error', { volume: 0.54, bus: 'ui' });
  }

  public playAchievementClaim(): void {
    this.unlock();
    if (!this.ctx || this.muted) return;
    this.playBuffer('achievement-claim', { volume: 0.74, bus: 'ui' });
  }

  /* ------------------------------------------------------------------ the lagoon */

  public playMangrovePlant(pan = -0.5): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('mangrove-plant', { volume: 0.72, rate: 0.96 + Math.random() * 0.09, pan });
  }

  public playBoatSaved(pan = -0.45): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('boat-saved', { volume: 0.74, rate: 0.98 + Math.random() * 0.05, pan });
  }

  public playFireDouse(pan = -0.55): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('fire-douse', { volume: 0.74, rate: 0.96 + Math.random() * 0.08, pan });
  }

  /** A wave against the steel hull of the mother ship. */
  public playTrawlerHit(pan = 0.4): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('trawler-hit', { volume: 0.78, rate: 0.93 + Math.random() * 0.14, pan });
  }

  /** A wave against the wooden hull of a raider. */
  public playShipHit(pan = 0.4): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('ship-hit', { volume: 0.72, rate: 0.92 + Math.random() * 0.16, pan });
  }

  /** A raider breaks up and goes down; what it carried is left floating. */
  public playShipSink(pan = 0.4): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('ship-sink', { volume: 0.62, rate: 0.95 + Math.random() * 0.1, pan });
    this.playBuffer('coin', { volume: 0.3, rate: 1.0, pan, delay: 0.12 });
    this.playBuffer('coin', { volume: 0.26, rate: 1.26, pan, delay: 0.24 });
  }

  /** A raider rams the pier. */
  public playPierHit(): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('pier-hit', { volume: 0.62, rate: 0.94 + Math.random() * 0.12, pan: -0.3 });
  }

  public playPirateBeat(strength: number): void {
    this.playBuffer('ship-hit', { volume: 0.32 * strength, rate: 0.72, pan: 0.25 });
  }

  /** The raiders' horn out at sea: a night of raids begins, or a big wave of them comes. */
  public playRaidHorn(urgent = false): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('raid-horn', { volume: urgent ? 0.6 : 0.5, rate: urgent ? 1.06 : 1, pan: 0.45 });
  }

  /** The opening's outboard, 0..1: its loop, louder and higher as the throttle opens. */
  public setMotor(level: number): void {
    if (!this.ctx || !this.sfxBus) return;
    const k = Math.max(0, Math.min(1, level));
    const now = this.ctx.currentTime;
    if (k > 0.001 && !this.muted) {
      if (this.motorStop !== null) {
        window.clearTimeout(this.motorStop);
        this.motorStop = null;
      }
      if (!this.motor) {
        const buf = this.buffers.get('boat-motor');
        if (!buf) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.0001;
        src.connect(gain);
        gain.connect(this.sfxBus);
        src.start();
        this.motor = { src, gain };
      }
      // the loop is recorded quiet, so it is brought up here
      this.motor.gain.gain.setTargetAtTime(0.0001 + k * 2.4, now, 0.12);
      this.motor.src.playbackRate.setTargetAtTime(0.86 + k * 0.3, now, 0.3);
    } else if (this.motor && this.motorStop === null) {
      const { src, gain } = this.motor;
      gain.gain.setTargetAtTime(0.0001, now, 0.1);
      this.motorStop = window.setTimeout(() => {
        this.motorStop = null;
        try {
          src.stop();
        } catch {
          // already stopped
        }
        gain.disconnect();
        if (this.motor?.src === src) this.motor = null;
      }, 700);
    }
  }

  /** Something hitting the water: a short wash of spray and a plop. */
  public playSplash(strength = 1, pan = 0): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('splash', { volume: Math.min(0.85, 0.52 * strength), rate: 0.92 + Math.random() * 0.18, pan });
  }

  /** Something thrown into the lagoon. */
  public playToss(): void {
    if (!this.ctx || this.muted || !this.ready('toss', 90)) return;
    this.playBuffer('toss', { volume: 0.5, rate: 0.94 + Math.random() * 0.14, pan: jitter(0.6) });
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

  /** Something small in the trees: the forest is on the left of the screen, so it sings from the left. */
  private playSongbird(level: number, delay = 0): void {
    this.playBuffer(Math.random() < 0.55 ? 'bird-tropical-1' : 'bird-tropical-2', {
      volume: 0.22 + Math.random() * 0.12 + level * 0.06,
      rate: 0.92 + Math.random() * 0.2,
      pan: -0.25 - Math.random() * 0.55,
      delay,
      bus: 'ambience',
    });
  }

  /** A gull calling over the water, from the sea side of the screen. */
  public playGull(): void {
    this.playBuffer('seagull', {
      volume: 0.2 + Math.random() * 0.1,
      rate: 0.92 + Math.random() * 0.16,
      pan: 0.25 + Math.random() * 0.55,
      bus: 'ambience',
    });
  }

  /* ------------------------------------------------------------------ the story */

  /** The mother dolphin: caught in the net, or free. */
  public playDolphin(mood: 'distress' | 'happy'): void {
    if (!this.ctx || this.muted) return;
    if (mood === 'distress') this.playBuffer('dolphin-distress', { volume: 0.55, rate: 1 + jitter(0.06), pan: 0.2 });
    else this.playBuffer('dolphin-happy', { volume: 0.6, rate: 1 + jitter(0.06), pan: 0.2 });
  }

  /** Netting giving way. */
  public playNetSnap(strength = 1): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('net-snap', { volume: Math.min(0.85, 0.62 * strength), rate: 0.96 + Math.random() * 0.08, pan: 0.25 });
  }

  /** Something is wrong: a worried two-note cue before the camera goes to look. */
  public playAlert(): void {
    if (!this.ctx || this.muted || !this.ready('alert', 400)) return;
    this.playBuffer('alert', { volume: 0.45, bus: 'ui' });
  }

  /** A.L.U.N. coming online. */
  public playAlunWake(): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('alun-wake', { volume: 0.6 });
  }

  public playVictory(): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('victory', { volume: 0.8, bus: 'ui' });
  }

  public playDefeat(): void {
    if (!this.ctx || this.muted) return;
    this.playBuffer('defeat', { volume: 0.62, bus: 'ui' });
  }
}
