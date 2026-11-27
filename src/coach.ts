/**
 * A spotlight on one control. The rest of the screen dims and takes no presses,
 * an arrow and a label point at the control until the player uses it.
 */
const PAD = 8;
const RADIUS = 18;
const ARROW = 56;
const GAP = 6;
const EDGE = 12;

type Side = 'top' | 'bottom' | 'left' | 'right';

const ROTATE: Record<Side, number> = { top: 0, bottom: 180, left: -90, right: 90 };

const ARROW_SVG = `
<svg viewBox="0 0 56 56" aria-hidden="true">
  <path d="M19 4h18v22h12L28 52 7 26h12z" fill="#ffe46b" stroke="#0d121d" stroke-width="4" stroke-linejoin="round"/>
  <path d="M23 8h10v20" fill="none" stroke="#fff7c2" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
</svg>`;

export class Coach {
  private root = document.createElement('div');
  private shade = document.createElement('div');
  private ring = document.createElement('div');
  private arrow = document.createElement('div');
  private label = document.createElement('div');
  private title = document.createElement('span');
  private sub = document.createElement('span');
  private target: HTMLElement | null = null;
  private key = '';
  private lastSig = '';
  private usePath = typeof CSS !== 'undefined' && CSS.supports('clip-path', 'path(evenodd, "M0 0H1V1Z")');

  constructor(host: HTMLElement) {
    this.root.className = 'coach hidden';
    this.shade.className = 'coach-shade';
    this.ring.className = 'coach-ring';
    this.arrow.className = 'coach-arrow';
    this.arrow.innerHTML = `<div class="coach-arrow-bob">${ARROW_SVG}</div>`;
    this.label.className = 'coach-label';
    this.label.dataset.swatch = 'gold';
    this.title.className = 'coach-title t-stroke-sm';
    this.sub.className = 'coach-sub t-stroke-xs';
    this.label.append(this.title, this.sub);
    this.root.append(this.shade, this.ring, this.arrow, this.label);
    // a press beside the spotlight only nudges the arrow
    this.shade.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.arrow.classList.remove('is-poked');
      void this.arrow.offsetWidth;
      this.arrow.classList.add('is-poked');
    });
    host.appendChild(this.root);
  }

  public get active(): boolean {
    return this.target !== null;
  }

  public show(key: string, target: HTMLElement, title: string, sub = ''): void {
    if (key !== this.key) {
      this.key = key;
      this.title.textContent = title;
      this.sub.textContent = sub;
      this.sub.hidden = sub === '';
      this.root.classList.remove('is-in');
      void this.root.offsetWidth;
      this.root.classList.add('is-in');
      this.lastSig = '';
    }
    this.target = target;
    this.root.classList.remove('hidden');
    this.place();
  }

  public hide(): void {
    if (!this.target && this.root.classList.contains('hidden')) return;
    this.target = null;
    this.key = '';
    this.lastSig = '';
    this.root.classList.add('hidden');
  }

  private place(): void {
    const t = this.target;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const sig = `${r.left | 0}:${r.top | 0}:${r.width | 0}:${r.height | 0}:${W}:${H}`;
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    if (r.width === 0 && r.height === 0) {
      this.root.classList.add('hidden');
      return;
    }
    this.root.classList.remove('hidden');

    const x = r.left - PAD;
    const y = r.top - PAD;
    const w = r.width + PAD * 2;
    const h = r.height + PAD * 2;
    const rad = Math.min(RADIUS, w / 2, h / 2);
    this.shade.style.clipPath = this.usePath
      ? `path(evenodd, "M0 0H${W}V${H}H0Z M${x + rad} ${y}H${x + w - rad}A${rad} ${rad} 0 0 1 ${x + w} ${y + rad}V${y + h - rad}A${rad} ${rad} 0 0 1 ${x + w - rad} ${y + h}H${x + rad}A${rad} ${rad} 0 0 1 ${x} ${y + h - rad}V${y + rad}A${rad} ${rad} 0 0 1 ${x + rad} ${y}Z")`
      : `polygon(evenodd, 0 0, ${W}px 0, ${W}px ${H}px, 0 ${H}px, 0 0, ${x}px ${y}px, ${x}px ${y + h}px, ${x + w}px ${y + h}px, ${x + w}px ${y}px, ${x}px ${y}px)`;
    Object.assign(this.ring.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, borderRadius: `${rad}px` });

    const lw = this.label.offsetWidth;
    const lh = this.label.offsetHeight;
    const need = { v: ARROW + GAP + lh + 4, h: ARROW + GAP + lw + 4 };
    const room: Record<Side, number> = {
      top: y - need.v,
      bottom: H - (y + h) - need.v,
      left: x - need.h,
      right: W - (x + w) - need.h,
    };
    // above or below reads best; the sides only when neither has room
    const side: Side = room.top >= 0 ? 'top' : room.bottom >= 0 ? 'bottom' : room.left >= room.right ? 'left' : 'right';

    const cx = x + w / 2;
    const cy = y + h / 2;
    let ax: number;
    let ay: number;
    let lx: number;
    let ly: number;
    if (side === 'top' || side === 'bottom') {
      ax = cx;
      ay = side === 'top' ? y - GAP - ARROW / 2 : y + h + GAP + ARROW / 2;
      lx = cx - lw / 2;
      ly = side === 'top' ? ay - ARROW / 2 - 4 - lh : ay + ARROW / 2 + 4;
    } else {
      ay = cy;
      ax = side === 'left' ? x - GAP - ARROW / 2 : x + w + GAP + ARROW / 2;
      ly = cy - lh / 2;
      lx = side === 'left' ? ax - ARROW / 2 - 4 - lw : ax + ARROW / 2 + 4;
    }
    lx = Math.max(EDGE, Math.min(W - EDGE - lw, lx));
    ly = Math.max(EDGE, Math.min(H - EDGE - lh, ly));
    this.arrow.style.transform = `translate(${ax - ARROW / 2}px, ${ay - ARROW / 2}px) rotate(${ROTATE[side]}deg)`;
    this.label.style.transform = `translate(${Math.round(lx)}px, ${Math.round(ly)}px)`;
  }
}
