import { getUiIconSvg } from './ui-kit/icons';

/**
 * The HUD's share of the game feel. Coins earned in the lagoon fly up to the purse and are counted
 * as they land; the combo chip pops with every catch, changes colour as the run grows and shows the
 * time left to keep it; a bought tool bursts. Everything here moves with transforms on its own layer
 * above the page, so no button or panel ever shifts.
 */

const MAX_FLYING = 26;

/** The combo chip's colour for a run this long. */
export function comboSwatch(count: number): 'gold' | 'orange' | 'red' | 'purple' {
  return count >= 20 ? 'purple' : count >= 10 ? 'red' : count >= 5 ? 'orange' : 'gold';
}

export class HudJuice {
  private readonly layer: HTMLDivElement;
  private readonly coinSvg = getUiIconSvg('coin');
  /** Value of the coins on their way to the purse: the purse does not show them yet. */
  private inFlight = 0;
  private flying = new Set<HTMLElement>();
  private comboCount = 0;
  private comboLeft = -1;
  /** Where the combo chip was last seen, for the copy that falls when the run ends. */
  private chipAt: DOMRect | null = null;
  private readonly timerFill: HTMLElement | null;

  constructor(
    private readonly coinPill: HTMLElement,
    private readonly coinIcon: HTMLElement,
    private readonly comboPill: HTMLElement,
    /** A coin reached the purse. */
    private readonly onCoin: () => void,
    /** False when the player asked for a still screen. */
    private readonly lively: () => boolean
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'fx-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.layer);
    this.timerFill = comboPill.querySelector('.combo-timer > span');
  }

  /** Coins not counted by the purse yet. */
  public pending(): number {
    return this.inFlight;
  }

  /** A new story: nothing from the old one is still on its way. */
  public reset(): void {
    for (const c of this.flying) c.remove();
    this.flying.clear();
    this.inFlight = 0;
    this.comboCount = 0;
  }

  /** Coins earned at a point on the page fly to the purse. A few coins stand for a big amount. */
  public flyCoins(x: number, y: number, amount: number): void {
    if (amount <= 0) return;
    // the purse shows from the first coin on: the very first ones need somewhere to go too
    this.coinPill.classList.remove('hidden');
    const to = this.coinIcon.getBoundingClientRect();
    // the HUD itself is away (a film, a menu): the coins are simply counted
    if (to.width === 0) return;
    const ex = to.left + to.width / 2;
    const ey = to.top + to.height / 2;
    const n = Math.max(1, Math.min(6, Math.round(Math.sqrt(amount) * 0.9)));
    const per = amount / n;
    for (let i = 0; i < n; i++) {
      if (this.flying.size >= MAX_FLYING) continue;
      this.inFlight += per;
      const c = document.createElement('div');
      c.className = 'fly-coin';
      c.innerHTML = this.coinSvg;
      this.layer.appendChild(c);
      this.flying.add(c);
      const sx = x + (Math.random() - 0.5) * 26;
      const sy = y + (Math.random() - 0.5) * 18;
      // a hop out of the water, then a swoop to the purse
      const hx = sx + (Math.random() - 0.5) * 110;
      const hy = sy - 50 - Math.random() * 60;
      const anim = c.animate(
        [
          { transform: `translate(${sx}px, ${sy}px) scale(0.35) rotate(0deg)`, opacity: 0 },
          { transform: `translate(${hx}px, ${hy}px) scale(1.12) rotate(${(Math.random() - 0.5) * 70}deg)`, opacity: 1, offset: 0.32, easing: 'cubic-bezier(.55,0,.85,.45)' },
          { transform: `translate(${ex}px, ${ey}px) scale(0.62) rotate(0deg)`, opacity: 1 },
        ],
        { duration: 560 + Math.random() * 160, delay: i * 70, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' }
      );
      const land = (): void => {
        if (!this.flying.delete(c)) return;
        c.remove();
        this.inFlight = Math.max(0, this.inFlight - per);
        this.landed();
      };
      anim.onfinish = land;
      anim.oncancel = land;
    }
  }

  private landed(): void {
    this.onCoin();
    this.coinPill.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
      { duration: 170, easing: 'cubic-bezier(.3,1.5,.6,1)' }
    );
    this.coinIcon.animate(
      [{ rotate: '0deg' }, { rotate: '-14deg' }, { rotate: '8deg' }, { rotate: '0deg' }],
      { duration: 260, easing: 'ease-out' }
    );
  }

  /** Called every frame with the combo and how much of its time is left (0..1). */
  public combo(count: number, left: number): void {
    const prev = this.comboCount;
    if (count !== prev) {
      this.comboCount = count;
      if (count >= 2) {
        this.comboPill.dataset.swatch = comboSwatch(count);
        // read once per change: the chip is already hidden by the time a run ends
        this.chipAt = this.comboPill.getBoundingClientRect();
        if (count > prev) {
          const big = count % 5 === 0;
          this.comboPill.animate(
            [{ transform: 'scale(1)' }, { transform: `scale(${big ? 1.5 : 1.26}) rotate(${big ? -5 : -2}deg)` }, { transform: 'scale(1)' }],
            { duration: big ? 380 : 210, easing: 'cubic-bezier(.3,1.6,.5,1)' }
          );
        }
      } else if (prev >= 5) {
        this.breakCombo(prev);
      }
    }
    if (count >= 2 && this.timerFill) {
      const k = Math.round(Math.max(0, Math.min(1, left)) * 100) / 100;
      if (k !== this.comboLeft) {
        this.comboLeft = k;
        this.timerFill.style.transform = `scaleX(${k})`;
      }
    }
  }

  /** A run of five or more ran out: the chip falls away (a copy of it; the real one is already gone). */
  private breakCombo(lost: number): void {
    const r = this.chipAt;
    this.chipAt = null;
    if (!this.lively() || !r || r.width === 0) return;
    const ghost = this.comboPill.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    ghost.classList.remove('hidden');
    ghost.classList.add('combo-ghost');
    // the HUD has already cleared the number from the real chip
    const num = ghost.querySelector('.num');
    if (num) num.textContent = String(lost);
    Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    this.layer.appendChild(ghost);
    ghost
      .animate(
        [
          { transform: 'translateY(0) rotate(0deg)', opacity: 1, filter: 'grayscale(0)' },
          { transform: 'translateY(6px) rotate(-4deg)', opacity: 1, filter: 'grayscale(1)', offset: 0.25 },
          { transform: 'translateY(46px) rotate(9deg)', opacity: 0, filter: 'grayscale(1)' },
        ],
        { duration: 520, easing: 'cubic-bezier(.5,0,.9,.6)' }
      )
      .finished.then(() => ghost.remove(), () => ghost.remove());
  }

  /** Sparks out of something on the page: a bought tool, a repaired pier. */
  public burstAt(target: Element, colors: string[] = ['#ffe07d', '#7ff7ff', '#ffffff', '#ffb8f0']): void {
    const r = target.getBoundingClientRect();
    if (r.width === 0) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const ring = document.createElement('div');
    ring.className = 'fx-ring';
    Object.assign(ring.style, { left: `${cx}px`, top: `${cy}px`, width: `${Math.max(r.width, r.height)}px`, height: `${Math.max(r.width, r.height)}px` });
    this.layer.appendChild(ring);
    ring
      .animate([{ transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0.95 }, { transform: 'translate(-50%, -50%) scale(1.9)', opacity: 0 }], { duration: 480, easing: 'cubic-bezier(.2,.8,.3,1)' })
      .finished.then(() => ring.remove(), () => ring.remove());
    const n = this.lively() ? 14 : 6;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'fx-spark';
      s.style.background = colors[i % colors.length];
      this.layer.appendChild(s);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const d = Math.max(r.width, r.height) * 0.45 + 30 + Math.random() * 46;
      s.animate(
        [
          { transform: `translate(${cx}px, ${cy}px) scale(1)`, opacity: 1 },
          { transform: `translate(${cx + Math.cos(a) * d}px, ${cy + Math.sin(a) * d}px) scale(0.2)`, opacity: 0 },
        ],
        { duration: 420 + Math.random() * 260, easing: 'cubic-bezier(.1,.7,.3,1)' }
      ).finished.then(() => s.remove(), () => s.remove());
    }
  }

  /** A number that changed: it jumps, tinted for a gain or a cost. */
  public popNumber(el: HTMLElement, gain: boolean): void {
    // the first and last frames are left to the element's own colour
    el.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.3)', color: gain ? '#9dff7a' : '#ff8b78', offset: 0.3 }, { transform: 'scale(1)' }],
      { duration: 360, easing: 'cubic-bezier(.3,1.4,.6,1)' }
    );
  }
}
