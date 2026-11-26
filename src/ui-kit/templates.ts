import { getUiIconSvg, type UiIconName } from './icons';

export type UiSwatch =
  | 'orange'
  | 'blue'
  | 'green'
  | 'gold'
  | 'teal'
  | 'purple'
  | 'red'
  | 'pink'
  | 'slate'
  | 'dark'
  | 'white';

export interface UpgradeCardProps {
  id: string;
  title: string;
  swatch: UiSwatch;
  icon: UiIconName;
  level: number;
  maxLevel: number;
  statLabel: string;
  statIcon: UiIconName;
  beforeText: string;
  afterText: string;
  desc: string;
  cost: number;
  canAfford: boolean;
  maxed: boolean;
  /** As far as the workshop can install it for now: the next level waits for supplies. */
  waiting: boolean;
}

export interface JournalCardProps {
  title: string;
  text: string;
  swatch: UiSwatch;
  icon: UiIconName;
  current: number;
  target: number;
  written: boolean;
  fresh: boolean;
}

export interface RadioCardProps {
  title: string;
  text: string;
  answered: boolean;
}

/** Section divider pill: ─── ✦ CATEGORY ─── */
export function renderSectionDivider(label: string, icon: UiIconName = 'sparkle'): string {
  return `
    <div class="ui-section-divider">
      <span class="ui-section-pill t-stroke-xs">
        ${getUiIconSvg(icon)}
        <span>${label}</span>
      </span>
    </div>
  `;
}

/** Star pips row (★ ★ ★ ☆ ☆) */
export function renderStarRow(level: number, maxLevel: number): string {
  const count = Math.min(6, maxLevel);
  let html = '<div class="ui-star-row">';
  for (let i = 0; i < count; i++) {
    html += getUiIconSvg(i < level ? 'star_on' : 'star_off', 'ui-star-pip');
  }
  html += '</div>';
  return html;
}

/** Reusable Vibrant Checkered Upgrade Card (Exact Shop Card Template) */
export function renderUpgradeCard(p: UpgradeCardProps): string {
  const classes = [
    'ui-upgrade-card',
    p.canAfford ? 'is-affordable' : '',
    p.maxed ? 'is-maxed' : '',
    p.waiting ? 'is-waiting' : '',
  ]
    .filter(Boolean)
    .join(' ');

  let cornerHtml = '';
  if (p.maxed) {
    cornerHtml = `<span class="ui-corner-tag tag-max t-stroke-xs">MAKS!</span>`;
  } else if (p.waiting) {
    cornerHtml = `<span class="ui-corner-tag tag-lock t-stroke-xs num">Lv ${p.level} penuh</span>`;
  } else if (p.level === 0) {
    cornerHtml = `<span class="ui-corner-tag t-stroke-xs">BARU!</span>`;
  }

  const showSunburst = p.canAfford || p.maxed;

  let ctaSwatch: UiSwatch = 'slate';
  let ctaContent = '';
  let ctaDisabled = 'disabled';

  if (p.maxed) {
    ctaSwatch = 'gold';
    ctaContent = `${getUiIconSvg('check', 'ui-btn-icon')}<span>MAKSIMAL</span>`;
    ctaDisabled = 'disabled';
  } else if (p.waiting) {
    ctaSwatch = 'slate';
    ctaContent = `${getUiIconSvg('lock', 'ui-btn-icon')}<span>Tunggu pasokan</span>`;
    ctaDisabled = 'disabled';
  } else if (p.canAfford) {
    ctaSwatch = 'green';
    ctaContent = `${getUiIconSvg('coin', 'ui-btn-icon')}<span class="num">${p.cost.toLocaleString('id-ID')}</span>`;
    ctaDisabled = '';
  } else {
    ctaSwatch = 'slate';
    ctaContent = `${getUiIconSvg('coin', 'ui-btn-icon')}<span class="num">${p.cost.toLocaleString('id-ID')}</span>`;
    ctaDisabled = 'disabled';
  }

  const statDeltaHtml = p.maxed || p.waiting
    ? `<span class="t-stroke-sm t-gold">${p.beforeText}</span>`
    : `
      <span class="t-stroke-sm">${p.beforeText}</span>
      ${getUiIconSvg('arrow_right', 'ui-arrow-icon')}
      <span class="t-stroke-sm t-lime">${p.afterText}</span>
    `;

  return `
    <article class="${classes}" data-swatch="${p.swatch}" data-upgrade-id="${p.id}">
      <div class="ui-card-head">
        <span class="ui-card-title t-stroke-md">${p.title}</span>
      </div>

      <div class="ui-card-stage">
        ${showSunburst ? '<div class="ui-sunburst"></div>' : ''}
        ${cornerHtml}
        ${p.canAfford ? getUiIconSvg('sparkle', 'ui-sparkle sp-1') : ''}
        ${getUiIconSvg(p.icon, 'ui-card-art')}
        ${renderStarRow(p.level, p.maxLevel)}
      </div>

      <div class="ui-card-meta">
        <div class="ui-stat-kicker t-stroke-xs">
          ${getUiIconSvg(p.statIcon)}
          <span>${p.statLabel}</span>
        </div>
        <div class="ui-stat-delta num">${statDeltaHtml}</div>
        <div class="ui-card-desc-mini">${p.desc}</div>
      </div>

      <button
        type="button"
        class="ui-btn ui-btn-block ui-card-cta t-stroke-md"
        data-swatch="${ctaSwatch}"
        data-buy-id="${p.id}"
        ${ctaDisabled}
      >
        ${ctaContent}
      </button>
    </article>
  `;
}

/** The free call on the workshop radio. It is a card like the others, only wider, and it costs nothing. */
export function renderRadioCard(p: RadioCardProps): string {
  return `
    <article class="ui-radio-card" data-swatch="red">
      <div class="ui-radio-art">${getUiIconSvg('radio')}</div>
      <div class="ui-radio-copy">
        <span class="ui-radio-kicker t-stroke-xs t-gold">RADIO BENGKEL · GRATIS</span>
        <span class="ui-radio-title t-stroke-md">${p.title}</span>
        <span class="ui-radio-text">${p.text}</span>
      </div>
      <button
        type="button"
        class="ui-btn t-stroke-md ui-radio-btn"
        data-swatch="${p.answered ? 'slate' : 'green'}"
        data-answer-call
        ${p.answered ? 'disabled' : ''}
      >
        ${getUiIconSvg(p.answered ? 'check' : 'radio', 'ui-btn-icon')}<span>${p.answered ? 'Sudah dijawab' : 'Jawab panggilan'}</span>
      </button>
    </article>
  `;
}

/** What the workshop is still waiting for, one line. */
export function renderSupplyLine(text: string): string {
  return `
    <div class="ui-supply-line">
      ${getUiIconSvg('basket', 'ui-supply-icon')}
      <span class="ui-supply-kicker t-stroke-xs t-gold">PASOKAN BERIKUTNYA</span>
      <span class="ui-supply-text">${text}</span>
    </div>
  `;
}

/** A page of the village journal: what happened, or what has yet to happen. */
export function renderJournalCard(p: JournalCardProps): string {
  const clamped = Math.max(0, Math.min(p.target, Math.floor(p.current)));
  const pct = Math.max(0, Math.min(100, (clamped / Math.max(1, p.target)) * 100));
  const foot = p.written
    ? `<span class="ui-journal-done t-stroke-xs">${getUiIconSvg('check')}<span>Tercatat</span></span>`
    : p.target > 1
      ? `<div class="ui-prog-pill">
            <div class="ui-prog-fill" style="width:${pct.toFixed(1)}%"></div>
            <span class="ui-prog-text t-stroke-xs num">${clamped.toLocaleString('id-ID')} / ${p.target.toLocaleString('id-ID')}</span>
          </div>`
      : '';

  return `
    <article class="ui-achieve-card ui-journal-card ${p.written ? '' : 'is-blank'} ${p.fresh ? 'is-fresh' : ''}" data-swatch="${p.written ? p.swatch : 'dark'}">
      <div class="ui-achieve-medallion">
        ${getUiIconSvg(p.icon)}
      </div>
      <div class="ui-achieve-body">
        <div>
          <div class="ui-achieve-title t-stroke-md">${p.title}</div>
          <div class="ui-achieve-desc t-stroke-xs">${p.text}</div>
        </div>
        ${foot ? `<div class="ui-journal-foot">${foot}</div>` : ''}
      </div>
      ${p.fresh ? '<span class="ui-corner-tag ui-journal-new t-stroke-xs">BARU!</span>' : ''}
    </article>
  `;
}

/** Reusable Stat Tile for Victory / Summary Modals */
export function renderStatTile(
  label: string,
  value: string,
  icon: UiIconName,
  swatch: UiSwatch
): string {
  return `
    <div class="ui-stat-tile" data-swatch="${swatch}">
      <div class="ui-stat-tile-icon">${getUiIconSvg(icon)}</div>
      <div class="ui-stat-tile-copy">
        <span class="ui-stat-tile-label t-stroke-xs">${label}</span>
        <strong class="ui-stat-tile-val t-stroke-md num">${value}</strong>
      </div>
    </div>
  `;
}

/** Burst playful cartoon confetti from any DOM element or screen point */
const CONFETTI_COLORS = ['#ffe652', '#74f664', '#5ad2ff', '#ff78c4', '#ff9436', '#c278ff', '#5af4d2'];

export function spawnUiConfetti(originEl?: HTMLElement | null, count = 26): void {
  let layer = document.getElementById('ui-confetti-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'ui-confetti-layer';
    document.body.appendChild(layer);
  }

  let ox = window.innerWidth * 0.5;
  let oy = window.innerHeight * 0.5;
  if (originEl) {
    const rect = originEl.getBoundingClientRect();
    ox = rect.left + rect.width * 0.5;
    oy = rect.top + rect.height * 0.5;
  }

  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.className = 'ui-confetti-piece';
    el.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    el.style.left = `${ox}px`;
    el.style.top = `${oy}px`;

    const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI * 1.45;
    const speed = 130 + Math.random() * 210;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed - 40;
    const rot = (Math.random() - 0.5) * 720;
    const dur = 620 + Math.random() * 440;

    layer.appendChild(el);
    const anim = el.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.5) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(calc(-50% + ${dx * 0.6}px), calc(-50% + ${dy * 0.7}px)) scale(1.1) rotate(${rot * 0.55}deg)`,
          opacity: 1,
          offset: 0.45,
        },
        {
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 170}px)) scale(0.75) rotate(${rot}deg)`,
          opacity: 0,
        },
      ],
      { duration: dur, easing: 'cubic-bezier(0.18, 0.78, 0.36, 1)', fill: 'forwards' }
    );
    anim.onfinish = () => el.remove();
  }
}
