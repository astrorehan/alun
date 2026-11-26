import type { TimeOfDay } from './types';

/**
 * Original real-time Web Audio Dynamic Soundtrack Engine for ALUN: Gema Pesisir Tropis.
 * Zero external copyrighted loops — composed procedurally for smooth live crossfading across:
 *   - Day (morning/noon/dawn): warm tropical marimba, nylon ukulele plucks, island bass & gentle shakers
 *   - Sunset: golden-hour mellow pads & slowed acoustic warmth
 *   - Night: calm yet eerie/tense ("mencekam/tenang") D-minor/Phrygian dark ocean drone, breathy bamboo
 *     suling flute, glassy bioluminescent chimes & soft heartbeat kendang pulse
 *   - Monsoon (Boss Night): urgent D-Phrygian war kendang, deep bass ostinato & dramatic storm swells
 */

export type MusicMood = 'day' | 'sunset' | 'night' | 'monsoon';

const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

interface ChordSpec {
  root: number;
  pad: number[];
  arp: number[];
}

/* ================= DAY / SUNSET SCORE (D Major / Lydian Tropical) ================= */

const DAY_CHORDS: ChordSpec[] = [
  // Section A: sunny lagoon breeze
  { root: 38, pad: [57, 62, 66, 69], arp: [62, 66, 69, 73, 76] }, // Dmaj9
  { root: 47, pad: [59, 62, 66, 69], arp: [59, 62, 66, 69, 73] }, // Bm7(9)
  { root: 43, pad: [55, 59, 62, 66], arp: [55, 59, 62, 66, 71] }, // Gmaj7
  { root: 45, pad: [57, 61, 64, 67], arp: [57, 61, 64, 69, 71] }, // A6/9
  // Section B: coastal nostalgia
  { root: 40, pad: [55, 59, 62, 66], arp: [64, 67, 71, 74, 78] }, // Em9
  { root: 45, pad: [57, 61, 64, 69], arp: [61, 64, 69, 71, 76] }, // A13
  { root: 42, pad: [57, 61, 64, 66], arp: [61, 64, 66, 69, 73] }, // F#m7
  { root: 43, pad: [55, 59, 62, 67], arp: [59, 62, 67, 69, 74] }, // Gadd9
];

// 16th-note melodic contours per bar (0 = rest, MIDI note otherwise) — airy tropical marimba phrases
const DAY_MELODY_A: (number | 0)[][] = [
  [74, 0, 0, 76, 0, 0, 78, 0, 0, 76, 74, 0, 73, 0, 0, 0],
  [71, 0, 0, 74, 0, 0, 78, 0, 0, 76, 0, 0, 74, 0, 0, 0],
  [71, 0, 74, 0, 76, 0, 0, 74, 0, 0, 71, 0, 69, 0, 0, 0],
  [69, 0, 0, 73, 0, 0, 76, 0, 0, 0, 74, 0, 73, 0, 0, 0],
  [76, 0, 0, 79, 0, 0, 78, 0, 76, 0, 74, 0, 71, 0, 0, 0],
  [73, 0, 0, 76, 0, 0, 81, 0, 0, 78, 0, 0, 76, 0, 0, 0],
  [73, 0, 76, 0, 78, 0, 0, 76, 0, 0, 73, 0, 71, 0, 0, 0],
  [74, 0, 0, 71, 0, 0, 69, 0, 74, 0, 0, 0, 0, 0, 0, 0],
];

const DAY_MELODY_B: (number | 0)[][] = [
  [78, 0, 0, 81, 0, 78, 76, 0, 0, 74, 0, 0, 76, 0, 0, 0],
  [74, 0, 78, 0, 0, 76, 74, 0, 71, 0, 0, 0, 0, 0, 0, 0],
  [79, 0, 0, 78, 0, 0, 74, 0, 71, 0, 74, 0, 76, 0, 0, 0],
  [76, 0, 0, 74, 0, 73, 0, 0, 69, 0, 73, 0, 0, 0, 0, 0],
  [79, 0, 0, 78, 0, 76, 0, 0, 74, 0, 71, 0, 74, 0, 0, 0],
  [76, 0, 0, 81, 0, 78, 0, 0, 76, 0, 0, 0, 73, 0, 0, 0],
  [78, 0, 0, 76, 0, 73, 0, 0, 74, 0, 76, 0, 78, 0, 0, 0],
  [79, 0, 0, 78, 0, 74, 0, 0, 74, 0, 0, 0, 0, 0, 0, 0],
];

/* ================= NIGHT SCORE (D Minor / Phrygian — Calm & Eerie / Mencekam) ================= */

const NIGHT_CHORDS: ChordSpec[] = [
  // Section A: still moonlit dark water
  { root: 38, pad: [50, 53, 57, 64], arp: [62, 65, 69, 76] }, // Dm9
  { root: 34, pad: [46, 53, 57, 64], arp: [58, 62, 65, 72] }, // Bbmaj7(#11)
  { root: 43, pad: [50, 55, 58, 65], arp: [58, 62, 67, 74] }, // Gm9
  { root: 45, pad: [52, 55, 58, 64], arp: [57, 61, 64, 70] }, // A7(b9) eerie tension
  // Section B: creeping pirate silhouettes (Phrygian chill!)
  { root: 38, pad: [50, 53, 57, 60], arp: [62, 65, 69, 72] }, // Dm7
  { root: 39, pad: [51, 55, 58, 62], arp: [63, 67, 70, 74] }, // Ebmaj7 (Phrygian bII!)
  { root: 36, pad: [48, 51, 55, 62], arp: [60, 63, 67, 74] }, // Cm9
  { root: 45, pad: [50, 52, 57, 61], arp: [57, 61, 64, 69] }, // A7sus4 -> A
];

// Sparse haunting bamboo suling phrases: [stepIndex (0..15), midi, durationBeats]
const NIGHT_FLUTE_PHRASES: Array<Array<[number, number, number]>> = [
  [[0, 74, 2.6], [10, 76, 1.4]],
  [[0, 77, 2.2], [8, 76, 1.2], [12, 74, 1.8]],
  [[2, 70, 2.4], [10, 69, 1.6]],
  [[0, 67, 1.8], [6, 69, 2.8]],
  [[0, 74, 2.0], [8, 72, 1.5], [12, 69, 2.2]],
  [[0, 75, 2.8], [10, 74, 1.6]], // Phrygian Eb5 -> D5 chill!
  [[2, 72, 2.0], [10, 70, 1.8]],
  [[0, 69, 2.2], [8, 64, 2.6]],
];

// Delicate bioluminescent water-chime glints on sparse steps
const NIGHT_CHIME_NOTES: (number | 0)[][] = [
  [0, 0, 0, 81, 0, 0, 0, 0, 0, 0, 0, 0, 76, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 82, 0, 0, 0, 0, 0, 0, 0, 77, 0],
  [0, 0, 0, 0, 79, 0, 0, 0, 0, 0, 0, 74, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 76, 0, 0, 0, 82, 0, 0, 0, 0, 0],
  [0, 0, 81, 0, 0, 0, 0, 0, 0, 0, 0, 77, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 87, 0, 0, 0, 0, 0, 82, 0, 0, 0],
  [0, 0, 0, 79, 0, 0, 0, 0, 0, 0, 75, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 73, 0, 0, 0, 0, 76, 0, 0, 0],
];

/* ================= MONSOON BOSS SCORE (D Phrygian Urgent Storm) ================= */

const BOSS_CHORDS: ChordSpec[] = [
  { root: 38, pad: [50, 53, 57, 62], arp: [62, 65, 69, 74, 77] }, // Dm
  { root: 39, pad: [51, 55, 58, 63], arp: [63, 67, 70, 75, 79] }, // Eb (Phrygian menace)
  { root: 36, pad: [48, 51, 55, 60], arp: [60, 63, 67, 72, 75] }, // Cm
  { root: 45, pad: [52, 55, 58, 61], arp: [61, 64, 67, 70, 73] }, // A7b9
];

export class TropicalMusicEngine {
  private ctx: AudioContext;
  private outNode: AudioNode;
  private noiseBuffer: AudioBuffer;

  private dayBus: GainNode;
  private nightBus: GainNode;
  private reverbSend: GainNode;
  private delaySend: GainNode;

  // Continuous nocturnal dark ocean drone (only audible during night/monsoon)
  private droneGain: GainNode;
  private droneFilter: BiquadFilterNode;
  private droneOscA: OscillatorNode;
  private droneOscB: OscillatorNode;
  private droneLfo: OscillatorNode;

  private mood: MusicMood = 'day';
  private muted = false;
  private paused = false;
  private running = false;
  private timerId: number | null = null;

  // Day/Sunset sequencer state
  private dayStep = 0;
  private dayBar = 0;
  private dayCycle = 0;
  private nextDayTime = 0;

  // Night/Monsoon sequencer state
  private nightStep = 0;
  private nightBar = 0;
  private nightCycle = 0;
  private nextNightTime = 0;

  constructor(ctx: AudioContext, destination: AudioNode, noiseBuffer: AudioBuffer) {
    this.ctx = ctx;
    this.outNode = destination;
    this.noiseBuffer = noiseBuffer;

    this.dayBus = ctx.createGain();
    this.dayBus.gain.value = 1.0;

    this.nightBus = ctx.createGain();
    this.nightBus.gain.value = 0.0001;

    // Gentle high-pass keeps sub mud clean
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 34;

    this.dayBus.connect(hp);
    this.nightBus.connect(hp);
    hp.connect(this.outNode);

    // Shared warm stereo convolution reverb
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.42;
    const convolver = ctx.createConvolver();
    convolver.buffer = this.createReverbImpulse(2.4, 2.9);
    const revLp = ctx.createBiquadFilter();
    revLp.type = 'lowpass';
    revLp.frequency.value = 3100;
    this.reverbSend.connect(convolver);
    convolver.connect(revLp);
    revLp.connect(hp);

    // Shared stereo ping-pong delay for glassy chimes & tropical echoes
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.28;
    const dL = ctx.createDelay(1.0);
    const dR = ctx.createDelay(1.0);
    dL.delayTime.value = 0.38;
    dR.delayTime.value = 0.52;
    const fbL = ctx.createGain();
    const fbR = ctx.createGain();
    fbL.gain.value = 0.26;
    fbR.gain.value = 0.26;
    const dLp = ctx.createBiquadFilter();
    dLp.type = 'lowpass';
    dLp.frequency.value = 2100;

    this.delaySend.connect(dLp);
    dLp.connect(dL);
    dL.connect(fbL);
    fbL.connect(dR);
    dR.connect(fbR);
    fbR.connect(dL);

    if (typeof ctx.createStereoPanner === 'function') {
      const pL = ctx.createStereoPanner();
      const pR = ctx.createStereoPanner();
      pL.pan.value = -0.58;
      pR.pan.value = 0.58;
      dL.connect(pL);
      dR.connect(pR);
      pL.connect(hp);
      pR.connect(hp);
    } else {
      dL.connect(hp);
      dR.connect(hp);
    }

    // Nocturnal deep oceanic pad drone (subtle, breathes slowly in D1/A1)
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 240;
    this.droneFilter.Q.value = 1.1;

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0001;

    this.droneOscA = ctx.createOscillator();
    this.droneOscA.type = 'sawtooth';
    this.droneOscA.frequency.value = midiToHz(38); // D2

    this.droneOscB = ctx.createOscillator();
    this.droneOscB.type = 'triangle';
    this.droneOscB.frequency.value = midiToHz(26) * 1.003; // D1 warm sub detune

    const droneSubGain = ctx.createGain();
    droneSubGain.gain.value = 0.85;
    const droneSawGain = ctx.createGain();
    droneSawGain.gain.value = 0.24;

    this.droneLfo = ctx.createOscillator();
    this.droneLfo.type = 'sine';
    this.droneLfo.frequency.value = 0.09; // 11-second slow ocean breath
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 120;
    this.droneLfo.connect(lfoDepth);
    lfoDepth.connect(this.droneFilter.frequency);

    this.droneOscA.connect(droneSawGain);
    this.droneOscB.connect(droneSubGain);
    droneSawGain.connect(this.droneFilter);
    droneSubGain.connect(this.droneFilter);
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.nightBus);
    this.droneGain.connect(this.reverbSend);

    this.droneOscA.start();
    this.droneOscB.start();
    this.droneLfo.start();
  }

  private createReverbImpulse(duration: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const impulse = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.pow(1 - t, decay);
        const white = Math.random() * 2 - 1;
        // Softly darken tail over time like warm tropical air / night bay
        lp = lp * 0.68 + white * 0.32;
        data[i] = lp * env * 0.55;
      }
    }
    return impulse;
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    const now = this.ctx.currentTime + 0.08;
    this.nextDayTime = now;
    this.nextNightTime = now;
    this.applyMoodMix(0.6);
    this.timerId = window.setInterval(() => this.tick(), 75);
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused && this.running) {
      const now = this.ctx.currentTime + 0.08;
      this.nextDayTime = Math.max(this.nextDayTime, now);
      this.nextNightTime = Math.max(this.nextNightTime, now);
    }
  }

  public setTimeOfDay(tod: TimeOfDay): void {
    const next: MusicMood =
      tod === 'monsoon'
        ? 'monsoon'
        : tod === 'night'
          ? 'night'
          : tod === 'sunset'
            ? 'sunset'
            : 'day';
    if (next === this.mood) return;
    const prev = this.mood;
    this.mood = next;

    // Reset phase cleanly when entering night/monsoon from day so the entrance lands on beat 1
    const now = this.ctx.currentTime + 0.1;
    if ((prev === 'day' || prev === 'sunset') && (next === 'night' || next === 'monsoon')) {
      this.nightStep = 0;
      this.nightBar = 0;
      this.nextNightTime = now;
    } else if ((prev === 'night' || prev === 'monsoon') && (next === 'day' || next === 'sunset')) {
      this.dayStep = 0;
      this.dayBar = 0;
      this.nextDayTime = now;
    }
    this.applyMoodMix(0.75);
  }

  private applyMoodMix(tau: number): void {
    const now = this.ctx.currentTime;
    const isNightish = this.mood === 'night' || this.mood === 'monsoon';
    const dayTarget = isNightish ? 0.0001 : this.mood === 'sunset' ? 0.92 : 1.0;
    const nightTarget = isNightish ? 1.0 : 0.0001;
    const droneTarget = this.mood === 'monsoon' ? 0.32 : this.mood === 'night' ? 0.28 : 0.0001;
    const droneFreq = this.mood === 'monsoon' ? 360 : 220;

    this.dayBus.gain.setTargetAtTime(dayTarget, now, tau);
    this.nightBus.gain.setTargetAtTime(nightTarget, now, tau);
    this.droneGain.gain.setTargetAtTime(droneTarget, now, tau);
    this.droneFilter.frequency.setTargetAtTime(droneFreq, now, tau);
  }

  private tick(): void {
    if (!this.running || this.muted || this.paused || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const horizon = now + 0.22;

    if (this.mood === 'day' || this.mood === 'sunset') {
      const bpm = this.mood === 'sunset' ? 86 : 96;
      const stepDur = 60 / bpm / 4; // 16th note
      if (this.nextDayTime < now - 0.5) this.nextDayTime = now + 0.05;
      while (this.nextDayTime < horizon) {
        this.scheduleDayStep(this.nextDayTime, stepDur);
        this.nextDayTime += stepDur;
        this.dayStep = (this.dayStep + 1) % 16;
        if (this.dayStep === 0) {
          this.dayBar = (this.dayBar + 1) % DAY_CHORDS.length;
          if (this.dayBar === 0) this.dayCycle += 1;
        }
      }
    } else {
      const bpm = this.mood === 'monsoon' ? 104 : 74;
      const stepDur = 60 / bpm / 4; // 16th note
      if (this.nextNightTime < now - 0.5) this.nextNightTime = now + 0.05;
      while (this.nextNightTime < horizon) {
        if (this.mood === 'monsoon') {
          this.scheduleMonsoonStep(this.nextNightTime, stepDur);
          this.nightStep = (this.nightStep + 1) % 16;
          if (this.nightStep === 0) {
            this.nightBar = (this.nightBar + 1) % BOSS_CHORDS.length;
            if (this.nightBar === 0) this.nightCycle += 1;
          }
        } else {
          this.scheduleNightStep(this.nextNightTime, stepDur);
          this.nightStep = (this.nightStep + 1) % 16;
          if (this.nightStep === 0) {
            this.nightBar = (this.nightBar + 1) % NIGHT_CHORDS.length;
            if (this.nightBar === 0) this.nightCycle += 1;
          }
        }
        this.nextNightTime += stepDur;
      }
    }
  }

  /* ================================================================ DAY / SUNSET SCHEDULER */

  private scheduleDayStep(t: number, stepDur: number): void {
    const step = this.dayStep;
    const bar = this.dayBar;
    const chord = DAY_CHORDS[bar];
    const isSunset = this.mood === 'sunset';
    // Gentle island swing on off-16ths
    const swing = step % 2 === 1 ? stepDur * 0.14 : 0;
    const time = t + swing;

    // 1. Warm sustained pad chord at start of each bar
    if (step === 0) {
      this.playPadChord(chord.pad, time, stepDur * 15.8, isSunset ? 0.11 : 0.085, this.dayBus, 1450);
    }

    // 2. Mellow island bass (syncopated tropical root-fifth groove)
    if (step === 0) {
      this.playWarmBass(midiToHz(chord.root), time, stepDur * 5.2, 0.21, this.dayBus);
    } else if (step === 6) {
      this.playWarmBass(midiToHz(chord.root + 7), time, stepDur * 2.4, 0.14, this.dayBus);
    } else if (step === 10) {
      this.playWarmBass(midiToHz(chord.root), time, stepDur * 3.8, 0.17, this.dayBus);
    } else if (step === 14 && bar % 2 === 1) {
      this.playWarmBass(midiToHz(chord.root + 5), time, stepDur * 1.8, 0.12, this.dayBus);
    }

    // 3. Nylon ukulele / acoustic tropical arpeggio & offbeat strums
    if (step === 2 || step === 8 || step === 12) {
      const idx = (step / 2 + bar) % chord.arp.length;
      this.playUkulelePluck(midiToHz(chord.arp[idx]), time, stepDur * 3.5, isSunset ? 0.095 : 0.08, -0.28, this.dayBus);
      if (step === 8) {
        const idx2 = (idx + 2) % chord.arp.length;
        this.playUkulelePluck(midiToHz(chord.arp[idx2]), time + 0.025, stepDur * 3.2, isSunset ? 0.075 : 0.065, -0.18, this.dayBus);
      }
    }

    // 4. Singing wooden marimba / kalimba melody (alternates A & B sections, breathes every 3rd cycle)
    const melodyBank = this.dayCycle % 2 === 0 ? DAY_MELODY_A : DAY_MELODY_B;
    const note = melodyBank[bar]?.[step] ?? 0;
    if (note > 0) {
      const octaveShift = this.dayCycle % 3 === 2 && step % 4 === 0 ? 12 : 0;
      const vel = isSunset ? 0.12 : 0.155;
      const pan = 0.18 + Math.sin(bar * 1.3 + step * 0.4) * 0.25;
      this.playMarimba(midiToHz(note + octaveShift), time, stepDur * 3.8, vel, pan, this.dayBus, true);
    }

    // 5. Gentle tropical percussion (softer during sunset)
    const percScale = isSunset ? 0.48 : 1.0;
    if (step % 2 === 0) {
      this.playShaker(time, (step % 4 === 2 ? 0.026 : 0.014) * percScale, 0.35, this.dayBus);
    }
    if (step === 0 || step === 10) {
      this.playKendang(time, 94, 0.11 * percScale, -0.1, this.dayBus);
    } else if (step === 6 || step === 14) {
      this.playKendang(time, 152, 0.055 * percScale, 0.15, this.dayBus);
    }
  }

  /* ================================================================ NIGHT SCHEDULER ("Mencekam / Tenang") */

  private scheduleNightStep(t: number, stepDur: number): void {
    const step = this.nightStep;
    const bar = this.nightBar;
    const chord = NIGHT_CHORDS[bar];

    // Shift continuous drone gently toward bar root (subtle nocturnal drift)
    if (step === 0) {
      this.droneOscA.frequency.setTargetAtTime(midiToHz(chord.root), t, 0.35);
      this.droneOscB.frequency.setTargetAtTime(midiToHz(chord.root - 12) * 1.003, t, 0.45);
      // Dark cello/ocean pad chord — lush, still, mysterious
      this.playPadChord(chord.pad, t, stepDur * 15.6, 0.125, this.nightBus, 780);
    }

    // 1. Subtle heartbeat / deep nocturnal kendang pulse (calm yet ominous!)
    if (step === 0) {
      this.playKendang(t, 64, 0.16, 0, this.nightBus);
    } else if (step === 3) {
      this.playKendang(t, 56, 0.085, 0, this.nightBus);
    } else if (step === 8) {
      this.playKendang(t, 62, 0.11, -0.08, this.nightBus);
    } else if (step === 14 && bar % 2 === 1) {
      this.playKendang(t, 82, 0.06, 0.12, this.nightBus);
    }

    // 2. Distant submarine / coastal sonar ping on odd bars — iconic A.L.U.N. midnight watch tension!
    if (step === 12 && bar % 2 === 0) {
      this.playSonarPing(midiToHz(bar === 0 || bar === 4 ? 74 : 76), t, 0.055, bar % 4 === 0 ? -0.45 : 0.45);
    }

    // 3. Haunting breathy bamboo suling flute (leaves eerie silence every 3rd cycle on half the bars)
    const phrase = NIGHT_FLUTE_PHRASES[bar];
    if (phrase && !(this.nightCycle % 3 === 2 && bar % 2 === 1)) {
      for (const [sIdx, midi, beats] of phrase) {
        if (sIdx === step) {
          this.playSulingFlute(midiToHz(midi), t, beats * stepDur * 4, 0.115, -0.22);
        }
      }
    }

    // 4. Glassy bioluminescent water-chimes / gamelan harmonics (calm sparkling night lagoon)
    const chime = NIGHT_CHIME_NOTES[bar]?.[step] ?? 0;
    if (chime > 0) {
      const pan = step < 8 ? 0.48 : -0.46;
      this.playNightChime(midiToHz(chime), t, stepDur * 7.5, 0.082, pan);
    }

    // 5. Sparse deep plucked minor bass note on beat 3 for quiet gravity
    if (step === 8) {
      this.playWarmBass(midiToHz(chord.root), t, stepDur * 5.8, 0.13, this.nightBus);
    }
  }

  /* ================================================================ MONSOON BOSS SCHEDULER */

  private scheduleMonsoonStep(t: number, stepDur: number): void {
    const step = this.nightStep;
    const bar = this.nightBar;
    const chord = BOSS_CHORDS[bar];

    if (step === 0) {
      this.droneOscA.frequency.setTargetAtTime(midiToHz(chord.root), t, 0.15);
      this.droneOscB.frequency.setTargetAtTime(midiToHz(chord.root - 12) * 1.003, t, 0.2);
      this.playPadChord(chord.pad, t, stepDur * 15.5, 0.14, this.nightBus, 1180);
      if (bar === 0) {
        this.playDeepGong(midiToHz(38), t, 0.18);
      }
    }

    // Driving dark sub-bass ostinato (eighth-note pulse)
    if (step % 2 === 0) {
      const accent = step === 0 || step === 6 || step === 12 ? 0.21 : 0.13;
      const pitch = step === 14 ? chord.root + 1 : chord.root; // Phrygian half-step tension!
      this.playWarmBass(midiToHz(pitch), t, stepDur * 1.8, accent, this.nightBus);
    }

    // Urgent war kendang / storm drums
    if (step === 0 || step === 6 || step === 10) {
      this.playKendang(t, 68, 0.24, 0, this.nightBus);
    } else if (step === 4 || step === 12) {
      this.playKendang(t, 118, 0.15, -0.18, this.nightBus);
    } else if (step === 14 || step === 15) {
      this.playKendang(t, 146, 0.11, 0.22, this.nightBus);
    }

    // Tense minor gamelan/marimba ostinato
    if (step % 2 === 0) {
      const idx = (step / 2 + bar) % chord.arp.length;
      const pan = (step % 4 === 0 ? -0.35 : 0.35);
      this.playMarimba(midiToHz(chord.arp[idx]), t, stepDur * 2.2, 0.11, pan, this.nightBus, true);
    }

    // Dramatic high suling cry on alternating bars
    if (step === 0 && bar % 2 === 0) {
      const note = bar === 0 ? 74 : 75; // D5 / Eb5 Phrygian battle tension
      this.playSulingFlute(midiToHz(note), t, stepDur * 10, 0.12, 0.18);
    }
  }

  /* ================================================================ INSTRUMENTS */

  private route(node: AudioNode, bus: GainNode, pan: number, revAmount = 0, delayAmount = 0): void {
    let out: AudioNode = node;
    if (Math.abs(pan) > 0.01 && typeof this.ctx.createStereoPanner === 'function') {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-0.9, Math.min(0.9, pan));
      node.connect(p);
      out = p;
    }
    out.connect(bus);
    if (revAmount > 0) {
      const g = this.ctx.createGain();
      g.gain.value = revAmount;
      out.connect(g);
      g.connect(this.reverbSend);
    }
    if (delayAmount > 0) {
      const g = this.ctx.createGain();
      g.gain.value = delayAmount;
      out.connect(g);
      g.connect(this.delaySend);
    }
  }

  private playPadChord(midis: number[], t: number, dur: number, vol: number, bus: GainNode, cutoff: number): void {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff * 0.72, t);
    lp.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.45);
    lp.frequency.linearRampToValueAtTime(cutoff * 0.65, t + dur);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.9, dur * 0.25));
    g.gain.setValueAtTime(vol * 0.88, t + dur * 0.72);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.35);

    lp.connect(g);
    this.route(g, bus, 0, 0.55, 0);

    const perVoice = 1 / Math.max(1, midis.length);
    for (let i = 0; i < midis.length; i++) {
      const freq = midiToHz(midis[i]);
      const osc = this.ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.detune.setValueAtTime((i - 1.5) * 4.5, t);
      const vg = this.ctx.createGain();
      vg.gain.value = perVoice;
      osc.connect(vg);
      vg.connect(lp);
      osc.start(t);
      osc.stop(t + dur + 0.45);
    }
  }

  /** Warm wooden marimba / kalimba pluck with authentic hollow overtone transient. */
  private playMarimba(
    freq: number,
    t: number,
    dur: number,
    vol: number,
    pan: number,
    bus: GainNode,
    withEcho: boolean
  ): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    // Classic marimba wood bar overtone (near 4x fundamental, decays very quickly)
    const bar = this.ctx.createOscillator();
    bar.type = 'triangle';
    bar.frequency.setValueAtTime(freq * 3.96, t);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.linearRampToValueAtTime(vol * 0.24, t + 0.004);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.11, dur * 0.25));

    osc.connect(g);
    bar.connect(bg);
    bg.connect(g);
    this.route(g, bus, pan, 0.42, withEcho ? 0.24 : 0);

    osc.start(t);
    bar.start(t);
    osc.stop(t + dur + 0.05);
    bar.stop(t + Math.min(0.14, dur) + 0.02);
  }

  /** Soft nylon ukulele / acoustic guitar finger-pluck. */
  private playUkulelePluck(freq: number, t: number, dur: number, vol: number, pan: number, bus: GainNode): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(4200, freq * 6.5), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(420, freq * 1.4), t + dur * 0.8);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(lp);
    lp.connect(g);
    this.route(g, bus, pan, 0.3, 0.14);

    osc.start(t);
    osc.stop(t + dur + 0.04);
  }

  /** Warm rounded acoustic bass. */
  private playWarmBass(freq: number, t: number, dur: number, vol: number, bus: GainNode): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    const harm = this.ctx.createOscillator();
    harm.type = 'triangle';
    harm.frequency.setValueAtTime(freq * 2, t);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(380, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + dur);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const hg = this.ctx.createGain();
    hg.gain.value = 0.25;

    osc.connect(lp);
    harm.connect(hg);
    hg.connect(lp);
    lp.connect(g);
    g.connect(bus);

    osc.start(t);
    harm.start(t);
    osc.stop(t + dur + 0.05);
    harm.stop(t + dur + 0.05);
  }

  /** Haunting Indonesian bamboo suling flute: warm tone + subtle breathy air + delayed vibrato. */
  private playSulingFlute(freq: number, t: number, dur: number, vol: number, pan: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    // Gentle grace pitch slide into the note like a real bamboo flute
    osc.frequency.setValueAtTime(freq * 0.985, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.11);

    const o2 = this.ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(freq * 2, t);
    const o2g = this.ctx.createGain();
    o2g.gain.value = 0.12;

    // Expressive vibrato swells in gently after attack
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 4.6;
    const vibGain = this.ctx.createGain();
    vibGain.gain.setValueAtTime(0.5, t);
    vibGain.gain.linearRampToValueAtTime(freq * 0.012, t + Math.min(0.65, dur * 0.45));
    vib.connect(vibGain);
    vibGain.connect(osc.frequency);

    // Subtle breath air layer
    const breath = this.ctx.createBufferSource();
    breath.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(4500, freq * 2.1);
    bp.Q.value = 4.5;
    const brGain = this.ctx.createGain();
    brGain.gain.setValueAtTime(0.0001, t);
    brGain.gain.linearRampToValueAtTime(vol * 0.18, t + 0.14);
    brGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.28, dur * 0.25));
    g.gain.setValueAtTime(vol * 0.82, t + dur * 0.72);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);

    osc.connect(g);
    o2.connect(o2g);
    o2g.connect(g);
    breath.connect(bp);
    bp.connect(brGain);
    brGain.connect(this.nightBus);

    this.route(g, this.nightBus, pan, 0.78, 0.36);

    osc.start(t);
    o2.start(t);
    vib.start(t);
    breath.start(t, Math.random() * 1.5, dur + 0.1);
    osc.stop(t + dur + 0.2);
    o2.stop(t + dur + 0.2);
    vib.stop(t + dur + 0.2);
  }

  /** Delicate bioluminescent water-chime / nocturnal gamelan bell. */
  private playNightChime(freq: number, t: number, dur: number, vol: number, pan: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    // Subtle glassy inharmonic shimmer (2.756x bell partial)
    const bell = this.ctx.createOscillator();
    bell.type = 'sine';
    bell.frequency.setValueAtTime(freq * 2.756, t);
    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(vol * 0.22, t);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.32);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.007);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(g);
    bell.connect(bg);
    bg.connect(g);
    this.route(g, this.nightBus, pan, 0.72, 0.52);

    osc.start(t);
    bell.start(t);
    osc.stop(t + dur + 0.06);
    bell.stop(t + dur * 0.36);
  }

  /** Distant coastal sonar ping for quiet midnight watch tension. */
  private playSonarPing(freq: number, t: number, vol: number, pan: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.009);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.65);

    osc.connect(g);
    this.route(g, this.nightBus, pan, 0.85, 0.55);
    osc.start(t);
    osc.stop(t + 1.75);
  }

  /** Resonant deep gamelan gong for Boss Monsoon downbeats. */
  private playDeepGong(freq: number, t: number, vol: number): void {
    const o1 = this.ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(freq, t);
    const o2 = this.ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(freq * 1.498, t);
    const o3 = this.ctx.createOscillator();
    o3.type = 'sine';
    o3.frequency.setValueAtTime(freq * 2.41, t);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(920, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 2.8);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);

    const g2 = this.ctx.createGain();
    g2.gain.value = 0.32;
    const g3 = this.ctx.createGain();
    g3.gain.value = 0.16;

    o1.connect(lp);
    o2.connect(g2);
    g2.connect(lp);
    o3.connect(g3);
    g3.connect(lp);
    lp.connect(g);
    this.route(g, this.nightBus, 0, 0.85, 0);

    o1.start(t);
    o2.start(t);
    o3.start(t);
    o1.stop(t + 3.3);
    o2.stop(t + 3.3);
    o3.stop(t + 3.3);
  }

  /** Soft wooden kendang / coastal hand-drum membrane hit. */
  private playKendang(t: number, startHz: number, vol: number, pan: number, bus: GainNode): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startHz * 1.45, t);
    osc.frequency.exponentialRampToValueAtTime(startHz * 0.72, t + 0.12);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);

    osc.connect(g);
    this.route(g, bus, pan, 0.18, 0);
    osc.start(t);
    osc.stop(t + 0.28);
  }

  /** Delicate brushed tropical shaker. */
  private playShaker(t: number, vol: number, pan: number, bus: GainNode): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 6400;
    hp.Q.value = 1.6;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);

    src.connect(hp);
    hp.connect(g);
    this.route(g, bus, pan, 0.12, 0);
    src.start(t, Math.random() * 2.2, 0.07);
  }

  public dispose(): void {
    this.running = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    try {
      this.droneOscA.stop();
      this.droneOscB.stop();
      this.droneLfo.stop();
    } catch {
      // ignore
    }
  }
}
