import type { Mood } from './story/talk';
import { portraitSvg, portraitWho, type PortraitWho } from './ui-kit/portraits';

/** Seconds into a line at which each of its letters shows. */
export type Timeline = number[];

/** What a card needs from the sound side. */
export interface VoiceLink {
  /** A line starts: the speaker's exclamation for its mood. Its length in seconds, or null for none. */
  start(sender: string, mood?: Mood): number | null;
  /** True while that exclamation is still being heard. */
  speaking(): boolean;
  /** Loudness of the voice right now, 0..1. */
  level(): number;
  /** One syllable of babble, for a line said without an exclamation. */
  blip(sender: string): void;
  stop(click: boolean): void;
  prefetch(sender: string, mood?: Mood): void;
}

const VOWEL = /[aiueoAIUEO]/;

/** When each letter of a typed line shows: talking speed, with a breath at commas and full stops. */
export function typedTimeline(text: string, cps: number): Timeline {
  const at: number[] = [];
  let t = 0;
  for (let i = 0; i < text.length; i++) {
    at.push(t);
    const ch = text[i];
    t += 1 / cps;
    const end = i + 1 >= text.length || text[i + 1] === ' ';
    if (!end) continue;
    if (ch === ',' || ch === ';' || ch === ':') t += 0.16;
    else if (ch === '.' || ch === '!' || ch === '?') t += text[i - 1] === '.' ? 0.12 : 0.32;
  }
  return at;
}

/** How many letters show at time t. */
function shownAt(at: Timeline, t: number): number {
  let lo = 0;
  let hi = at.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * A card with a speaker's face, name and line. The whole line is laid out from the first frame
 * (the part not yet said is only transparent), so the card never grows while it is said.
 */
export class RadioCard {
  private readonly portrait: HTMLElement;
  private readonly name: HTMLElement;
  private readonly said: HTMLElement;
  private readonly unsaid: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly spoken: HTMLElement;
  private text = '';
  private shown = -1;
  private age = 0;
  private talk = 0;
  private who: PortraitWho | null = null;
  private leaveTimer: number | null = null;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = `
      <div class="radio-portrait" aria-hidden="true"><div class="radio-portrait-art"></div></div>
      <div class="radio-bubble" aria-hidden="true">
        <div class="radio-head">
          <span class="radio-name t-stroke-xs"></span>
          <span class="radio-eq"><i></i><i></i><i></i><i></i><i></i></span>
        </div>
        <p class="radio-line"><span class="radio-said"></span><span class="radio-unsaid"></span></p>
        <span class="radio-timer"><i></i></span>
        <span class="radio-next"><span class="radio-next-label">Lanjut</span><i></i></span>
      </div>
      <span class="radio-sr" role="status" aria-live="polite"></span>`;
    const q = (sel: string): HTMLElement => root.querySelector(sel) as HTMLElement;
    this.portrait = q('.radio-portrait-art');
    this.name = q('.radio-name');
    this.said = q('.radio-said');
    this.unsaid = q('.radio-unsaid');
    this.timer = q('.radio-timer > i');
    this.spoken = q('.radio-sr');
    root.classList.add('radio-card');
  }

  /** Someone starts talking. */
  public show(sender: string, text: string): void {
    if (this.leaveTimer !== null) {
      window.clearTimeout(this.leaveTimer);
      this.leaveTimer = null;
    }
    const who = portraitWho(sender);
    if (who !== this.who) {
      this.portrait.innerHTML = portraitSvg(who);
      this.who = who;
    }
    this.root.dataset.who = who;
    this.name.textContent = sender;
    this.text = text;
    this.age = 0;
    this.shown = -1;
    this.talk = 0;
    this.spoken.textContent = `${sender}: ${text}`;
    this.render(0);
    this.root.style.setProperty('--talk', '0');
    this.timer.style.transform = 'scaleX(1)';
    this.root.classList.remove('hidden', 'is-leaving', 'is-in', 'is-waiting');
    // restart the entrance even when one line follows another straight away
    void this.root.offsetWidth;
    this.root.classList.add('is-in');
  }

  public render(n: number): void {
    const count = Math.max(0, Math.min(this.text.length, n));
    if (count === this.shown) return;
    this.shown = count;
    this.said.textContent = this.text.slice(0, count);
    this.unsaid.textContent = this.text.slice(count);
  }

  /** The mouth and level bars follow the voice; with no voice they still move while words appear. */
  public mouth(dt: number, level: number, typing: boolean): void {
    this.age += dt;
    let target = level;
    if (target < 0.04 && typing) target = 0.3 + 0.35 * Math.abs(Math.sin(this.age * 17.3) * Math.sin(this.age * 6.1 + 1.3));
    this.talk += (target - this.talk) * (target > this.talk ? 0.65 : 0.3);
    this.root.style.setProperty('--talk', this.talk.toFixed(3));
  }

  /** The strip along the bottom: how much longer the line stays. */
  public progress(left: number): void {
    this.timer.style.transform = `scaleX(${Math.max(0, Math.min(1, left)).toFixed(3)})`;
  }

  /** The line is all said: show that a click goes on. */
  public waiting(on: boolean): void {
    this.root.classList.toggle('is-waiting', on);
  }

  public get leaving(): boolean {
    return this.leaveTimer !== null;
  }

  /** The line is over: the card drops away, then hides. */
  public leave(): void {
    if (this.root.classList.contains('hidden') || this.leaveTimer !== null) return;
    this.root.classList.remove('is-in', 'is-waiting');
    this.root.classList.add('is-leaving');
    this.root.style.setProperty('--talk', '0');
    this.leaveTimer = window.setTimeout(() => {
      this.leaveTimer = null;
      this.root.classList.add('hidden');
      this.root.classList.remove('is-leaving');
    }, 200);
  }

  public hideNow(): void {
    if (this.leaveTimer !== null) window.clearTimeout(this.leaveTimer);
    this.leaveTimer = null;
    this.root.classList.add('hidden');
    this.root.classList.remove('is-leaving', 'is-in', 'is-waiting');
    this.spoken.textContent = '';
  }
}

/**
 * One line being said on a card, typed at talking speed. It opens with the speaker's exclamation
 * when they have one; otherwise each vowel gets a babble syllable as it appears.
 */
export class Speech {
  private sender = '';
  private text = '';
  private at: Timeline = [];
  private voiced = false;
  private t = 0;
  private count = 0;
  private lastBlip = -1;

  constructor(
    readonly card: RadioCard,
    private readonly link: () => VoiceLink | undefined,
    private readonly cps: () => number
  ) {}

  public start(sender: string, text: string, mood?: Mood): void {
    this.sender = sender;
    this.text = text;
    this.voiced = (this.link()?.start(sender, mood) ?? null) !== null;
    this.at = typedTimeline(text, this.cps());
    this.t = 0;
    this.count = 0;
    this.lastBlip = -1;
    this.card.show(sender, text);
  }

  public tick(dt: number): void {
    const link = this.link();
    this.t += dt;
    const n = shownAt(this.at, this.t);
    if (!this.voiced && link && n > this.count) {
      for (let i = this.count; i < n; i++) {
        if (!VOWEL.test(this.text[i]) || this.t - this.lastBlip < 0.07) continue;
        this.lastBlip = this.t;
        link.blip(this.sender);
      }
    }
    this.count = Math.max(this.count, n);
    this.card.render(this.count);
    this.card.mouth(dt, this.voiced && link ? link.level() : 0, this.typing);
  }

  /** Letters still to show. */
  public get typing(): boolean {
    return this.count < this.text.length;
  }

  /** Still being said: letters to show, or her exclamation still heard. */
  public get busy(): boolean {
    return this.typing || (this.voiced && (this.link()?.speaking() ?? false));
  }

  /** Show the rest of the line now; an exclamation carries on to its end. */
  public finish(): void {
    this.count = this.text.length;
    this.card.render(this.count);
  }

  public stop(click: boolean): void {
    if (this.voiced) this.link()?.stop(click);
    this.voiced = false;
  }
}
