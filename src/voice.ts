import type { TropicalAudio } from './audio';
import type { VoiceMode } from './settings';
import type { Mood } from './story/talk';

/**
 * The people on the radio. Bu Sari opens each line of her scenes with a short exclamation in her
 * own voice, picked by the line's mood ("Aduh, aduh...", "Eh! Eh, eh!"); the clips are made by
 * `npm run generate:voice` and listed in public/audio/voice/manifest.json. Every other line is
 * typed with a babble: a short pitched syllable per vowel, a beep for the machine.
 */

interface Take {
  f: string;
  d: number;
}

interface Manifest {
  version: number;
  mumbles?: Record<string, Partial<Record<Mood, Take[]>>>;
}

interface Babble {
  pitch: number;
  /** How far one syllable may wander from the speaker's pitch. */
  spread: number;
  wave: OscillatorType;
  formant: number;
  q: number;
  peak: number;
  /** Pitch at the end of a syllable, as part of where it began. */
  glide: number;
  len: number;
}

/** How each speaker babbles: the machine beeps, the fisherman rumbles. */
const BABBLE: Record<string, Babble> = {
  'A.L.U.N.': { pitch: 900, spread: 0.7, wave: 'square', formant: 2100, q: 1.1, peak: 0.06, glide: 1.35, len: 0.05 },
  'BU SARI': { pitch: 300, spread: 0.32, wave: 'triangle', formant: 1200, q: 1.3, peak: 0.17, glide: 0.9, len: 0.07 },
  'PAK DAMAR': { pitch: 140, spread: 0.26, wave: 'sawtooth', formant: 760, q: 1.6, peak: 0.11, glide: 0.93, len: 0.075 },
  'PENJAGA RIMBA': { pitch: 205, spread: 0.28, wave: 'triangle', formant: 950, q: 1.4, peak: 0.15, glide: 0.92, len: 0.07 },
};

/** The squelch comes first; the voice starts just after it. */
const SQUELCH_LEAD = 0.09;

export class RadioVoice {
  private mumbles: NonNullable<Manifest['mumbles']> | null = null;
  private loading = false;
  private clips = new Map<string, Promise<AudioBuffer | null>>();
  /** The take used last for each speaker and mood, so the same one does not come twice running. */
  private last = new Map<string, string>();
  private src: { node: AudioBufferSourceNode; gain: GainNode } | null = null;
  /** Bumped by every new line, so a clip that decodes late does not talk over the next one. */
  private token = 0;
  private endAt = 0;
  private live = false;

  constructor(private readonly audio: TropicalAudio) {}

  /** Fetch the list of clips once. Until it arrives every line is babbled. */
  public load(): void {
    if (this.loading) return;
    this.loading = true;
    void fetch('./audio/voice/manifest.json')
      .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
      .then((m) => {
        this.mumbles = m?.mumbles ?? {};
      })
      .catch(() => {
        this.mumbles = {};
      });
  }

  private takes(sender: string, mood: Mood | undefined): Take[] {
    const set = this.mumbles?.[sender];
    return set?.[mood ?? 'ngobrol'] ?? set?.ngobrol ?? [];
  }

  /** Start decoding the clips a waiting line may use, so they are ready when it is shown. */
  public prefetch(sender: string, mood?: Mood): void {
    for (const take of this.takes(sender, mood)) void this.clip(take.f);
  }

  private clip(file: string): Promise<AudioBuffer | null> {
    const cached = this.clips.get(file);
    if (cached) return cached;
    const out = this.audio.voiceOut();
    if (!out) return Promise.resolve(null);
    const p = fetch(`./audio/voice/${file}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => out.ctx.decodeAudioData(data))
      .catch(() => null);
    this.clips.set(file, p);
    return p;
  }

  /**
   * A line starts: the speaker's exclamation for its mood. Returns how long it lasts, or null when
   * there is none to play (no clips for this speaker, voices set to babble or silence, sound off).
   */
  public start(sender: string, mood: Mood | undefined, mode: VoiceMode): number | null {
    this.stop(false);
    const token = ++this.token;
    const out = this.audio.voiceOut();
    if (!out || !this.audio.running || mode !== 'voice') return null;
    const takes = this.takes(sender, mood);
    if (takes.length === 0) return null;
    const slot = `${sender}/${mood ?? 'ngobrol'}`;
    const fresh = takes.length > 1 ? takes.filter((t) => t.f !== this.last.get(slot)) : takes;
    const take = fresh[Math.floor(Math.random() * fresh.length)];
    this.last.set(slot, take.f);
    this.audio.playRadioIn();
    this.audio.setVoiceDuck(true);
    const asked = out.ctx.currentTime;
    this.endAt = asked + SQUELCH_LEAD + take.d;
    this.live = true;
    void this.clip(take.f).then((buf) => {
      if (token !== this.token || !buf) return;
      const at = Math.max(out.ctx.currentTime, asked + SQUELCH_LEAD);
      this.endAt = at + buf.duration;
      this.play(out.ctx, out.bus, buf, at, token);
    });
    return take.d + SQUELCH_LEAD;
  }

  /** True while an exclamation is still being heard. */
  public speaking(): boolean {
    return this.live && this.audio.now() < this.endAt;
  }

  /** Cut the current line short; with `click`, the radio clicks shut like at the end of a line. */
  public stop(click = true): void {
    this.token++;
    const was = this.live;
    this.live = false;
    this.audio.setVoiceDuck(false);
    const n = this.src;
    this.src = null;
    if (n) {
      const t = this.audio.now();
      n.gain.gain.cancelScheduledValues(t);
      n.gain.gain.setTargetAtTime(0.0001, t, 0.02);
      try {
        n.node.stop(t + 0.12);
      } catch {
        // already stopped
      }
    }
    if (click && was) this.audio.playRadioOut();
  }

  private play(ctx: AudioContext, bus: GainNode, buf: AudioBuffer, at: number, token: number): void {
    const node = ctx.createBufferSource();
    node.buffer = buf;
    const gain = ctx.createGain();
    node.connect(gain);
    gain.connect(bus);
    const src = { node, gain };
    node.onended = () => {
      gain.disconnect();
      if (this.src !== src) return;
      this.src = null;
      // she has said her piece; the music comes back while the words finish
      if (token === this.token) this.audio.setVoiceDuck(false);
    };
    this.src = src;
    node.start(at);
  }

  /** One babble syllable: a pitched blip through the speaker's own formant. */
  public blip(sender: string): void {
    const out = this.audio.voiceOut();
    if (!out || !this.audio.running) return;
    const b = BABBLE[sender] ?? BABBLE['PENJAGA RIMBA'];
    const { ctx, bus } = out;
    const t = ctx.currentTime + 0.005;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const f = b.pitch * (1 - b.spread / 2 + Math.random() * b.spread);
    osc.type = b.wave;
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * b.glide, t + b.len);
    filter.type = 'bandpass';
    filter.frequency.value = b.formant;
    filter.Q.value = b.q;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(b.peak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + b.len);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    osc.onended = () => gain.disconnect();
    osc.start(t);
    osc.stop(t + b.len + 0.02);
  }

  /** The voice slider was let go: one of Bu Sari's happy exclamations, or her babble. */
  public sample(mode: VoiceMode): void {
    if (this.start('BU SARI', 'senang', mode) !== null) return;
    if (mode === 'off') return;
    for (let i = 0; i < 8; i++) window.setTimeout(() => this.blip('BU SARI'), i * 90);
  }
}
