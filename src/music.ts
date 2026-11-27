import type { TimeOfDay } from './types';

/**
 * The soundtrack: four recorded tracks (ElevenLabs Music, made by `npm run generate:music`), one per
 * mood of the lagoon, crossfaded as the day turns. Each track plays from its start once, then loops
 * between the points in public/audio/music/loops.json, where the music before both points was made
 * to match so the jump back passes unheard.
 *
 * A decoded track is large (about 30 MB a minute), so only the one playing and the one fading out
 * are kept decoded. The rest wait as their small MP3 bytes and are decoded again when their mood
 * comes back.
 */

export type MusicMood = 'day' | 'sunset' | 'night' | 'storm';

interface LoopPoints {
  start: number;
  end: number;
}

interface Playing {
  mood: MusicMood;
  src: AudioBufferSourceNode;
  gain: GainNode;
}

/** The order tracks are fetched in after the one that is needed first. */
const ORDER: MusicMood[] = ['day', 'sunset', 'night', 'storm'];
const FADE_OUT_S = 3.2;

export function moodFor(tod: TimeOfDay): MusicMood {
  if (tod === 'monsoon') return 'storm';
  if (tod === 'night') return 'night';
  if (tod === 'sunset') return 'sunset';
  return 'day';
}

export class MusicPlayer {
  private bytes = new Map<MusicMood, Promise<ArrayBuffer | null>>();
  private decoded = new Map<MusicMood, Promise<AudioBuffer | null>>();
  private loops: Partial<Record<MusicMood, LoopPoints>> = {};
  private loopsReady: Promise<void> | null = null;
  private playing: Playing | null = null;
  /** The track fading out after a change of mood, until it has stopped. */
  private leaving: MusicMood | null = null;
  private mood: MusicMood = 'day';
  private started = false;
  /** Fades the whole soundtrack while the tab is hidden, so it picks up where it was. */
  private readonly out: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(destination);
  }

  public start(): void {
    if (this.started) return;
    this.started = true;
    this.loopsReady = fetch('./audio/music/loops.json')
      .then((r) => (r.ok ? (r.json() as Promise<Partial<Record<MusicMood, LoopPoints>>>) : {}))
      .then((l) => {
        this.loops = l ?? {};
      })
      .catch(() => {
        this.loops = {};
      });
    void this.ensure(this.mood).then(() => {
      // the others' bytes arrive one at a time behind the first, so they never hold up the sound effects
      void ORDER.filter((m) => m !== this.mood).reduce<Promise<unknown>>((p, m) => p.then(() => this.fetchBytes(m)), Promise.resolve());
    });
  }

  public setTimeOfDay(tod: TimeOfDay): void {
    // asked every frame: only a change of mood does anything
    const next = moodFor(tod);
    if (next === this.mood) return;
    this.mood = next;
    if (this.started) void this.ensure(next);
  }

  public setPaused(paused: boolean): void {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(paused ? 0.0001 : 1, t, paused ? 0.08 : 0.4);
  }

  private fetchBytes(mood: MusicMood): Promise<ArrayBuffer | null> {
    let p = this.bytes.get(mood);
    if (!p) {
      p = fetch(`./audio/music/${mood}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
      this.bytes.set(mood, p);
    }
    return p;
  }

  private decode(mood: MusicMood): Promise<AudioBuffer | null> {
    let p = this.decoded.get(mood);
    if (!p) {
      // decoding takes the bytes it is given, so it gets a copy and the bytes stay for next time
      p = this.fetchBytes(mood)
        .then((data) => (data ? this.ctx.decodeAudioData(data.slice(0)) : null))
        .catch(() => null);
      this.decoded.set(mood, p);
    }
    return p;
  }

  /** Lets go of decoded tracks that are neither playing nor fading out. */
  private evict(): void {
    for (const m of this.decoded.keys()) {
      if (m !== this.playing?.mood && m !== this.leaving && m !== this.mood) this.decoded.delete(m);
    }
  }

  /** Plays the mood's track once it is ready, unless the lagoon has moved on to another by then. */
  private async ensure(mood: MusicMood): Promise<void> {
    const buf = await this.decode(mood);
    await this.loopsReady;
    if (!buf || this.mood !== mood || this.playing?.mood === mood) return;
    this.crossfade(mood, buf);
  }

  private crossfade(mood: MusicMood, buf: AudioBuffer): void {
    const t = this.ctx.currentTime;
    const old = this.playing;
    if (old) {
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setTargetAtTime(0.0001, t, 0.6);
      this.leaving = old.mood;
      try {
        old.src.stop(t + FADE_OUT_S);
      } catch {
        // already stopped
      }
      old.src.onended = () => {
        old.gain.disconnect();
        if (this.leaving === old.mood) this.leaving = null;
        this.evict();
      };
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const loop = this.loops[mood];
    if (loop && loop.end > loop.start + 1 && loop.end <= buf.duration) {
      src.loopStart = loop.start;
      src.loopEnd = loop.end;
    }
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    // a change of mood fades in; the very first track comes up quickly
    gain.gain.setTargetAtTime(1, t + (old ? 0.35 : 0), old ? 0.7 : 0.25);
    src.connect(gain);
    gain.connect(this.out);
    src.start(t + 0.02);
    this.playing = { mood, src, gain };
    this.evict();
  }
}
