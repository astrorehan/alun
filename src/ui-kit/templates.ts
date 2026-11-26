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

interface JournalEntryProps {
  date: string;
  title: string;
  text: string;
  swatch: UiSwatch;
  icon: UiIconName;
  written: boolean;
  fresh: boolean;
  tally?: { label: string; unit?: '%'; current: number; target: number };
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

const JOURNAL_WATER_SKETCH = `
  <path d="M11 69q14 -7 28 0t31 1m72 2q12 -8 25 -1t33 -1M38 79q16 -7 31 -1t36 0t29 -1t32 2M67 88q15 -5 28 0t30 0t25 0" />
  <path d="M23 52l6 -2m10 -1l9 -2m121 1l8 2m8 0l6 2M38 29l5 -3l6 4l6 -4l6 3m92 4l5 -3l5 3l6 -4l6 4" opacity=".55" />
`;

const JOURNAL_PIER_SKETCH = `
  <path d="M20 74l57 -18h62l56 18H20Zm22 0v14m130 -14v14M29 87q16 -6 32 -1m93 0q16 -7 34 0" />
  <path d="M40 68h136m-116 -6h96M82 56l-17 18m66 -18l21 18M41 36v10m-5 -5h10m119 -7v8m-4 -4h8m15 14h5" opacity=".6" />
`;

const JOURNAL_BENCH_SKETCH = `
  <path d="M24 70l39 -14h94l34 14v9H24v-9Zm0 0h167M44 79v9m127 -9v9" />
  <path d="M52 66h22m70 0h22m-110 -3l17 -5m76 1l12 5M44 43l7 3m4 -11l6 6m104 8l7 -3m-13 -4l4 -5" opacity=".6" />
`;

const JOURNAL_SHORE_SKETCH = `
  <path d="M15 76q36 -9 72 -5t48 -1t66 -7M45 84q25 -6 44 -3m58 0q22 -7 43 -7M34 73q1 -9 -4 -17m5 16q2 -8 8 -14m121 11q7 -9 5 -17m-4 16q5 -4 10 -5" />
  <path d="M58 77h5m49 -2h8m10 10h10m34 -3l7 -1M47 49l7 -3m106 -5l7 2" opacity=".6" />
`;

const JOURNAL_SKETCH_SCENERY: Partial<Record<UiIconName, string>> = {
  net: JOURNAL_PIER_SKETCH,
  wrench: JOURNAL_BENCH_SKETCH,
  moon: JOURNAL_PIER_SKETCH,
  shield: JOURNAL_PIER_SKETCH,
  rarity: JOURNAL_BENCH_SKETCH,
  mangrove: JOURNAL_SHORE_SKETCH,
  eco: JOURNAL_SHORE_SKETCH,
  fire: JOURNAL_SHORE_SKETCH,
};

function renderJournalSketch(icon: UiIconName): string {
  return `
    <div class="journal-sketch" aria-hidden="true">
      <svg class="journal-sketch-scene" viewBox="0 0 216 98" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round" stroke-linecap="round">
        ${JOURNAL_SKETCH_SCENERY[icon] ?? JOURNAL_WATER_SKETCH}
      </svg>
      ${getUiIconSvg(icon, 'journal-sketch-icon')}
    </div>
  `;
}

function renderJournalTally({ label, unit, current, target }: NonNullable<JournalEntryProps['tally']>): string {
  const value = Math.max(0, Math.min(target, Math.floor(current)));
  const fill = Math.round((value / target) * 100);
  const suffix = unit ?? '';
  const formatted = `${value.toLocaleString('id-ID')}${suffix} / ${target.toLocaleString('id-ID')}${suffix}`;
  return `
    <p class="journal-tally">
      <span class="journal-tally-marks" style="--tally-fill:${fill}%" aria-hidden="true"></span>
      <span>${label} <strong class="num">${formatted}</strong></span>
    </p>
  `;
}

/** A page of Bu Sari's diary, with pencil for what has yet to happen. */
export function renderJournalEntry(p: JournalEntryProps): string {
  const stamp = p.fresh ? '<span class="journal-new">BARU</span>'
    : p.written ? '' : '<span class="journal-pencil">Belum tercatat</span>';
  return `
    <article class="journal-leaf${p.written ? '' : ' journal-draft'}" data-swatch="${p.swatch}">
      <div class="journal-dateline"><span>${p.date}</span>${stamp}</div>
      <h3 class="journal-entry-heading">${p.title}</h3>
      <div class="journal-entry-detail">
        <div class="journal-entry-copy">
          <p class="journal-prose">${p.text}</p>
          ${!p.written && p.tally ? renderJournalTally(p.tally) : ''}
        </div>
        ${renderJournalSketch(p.icon)}
      </div>
    </article>
  `;
}

export function renderJournalRecord(day: number, rows: readonly { label: string; value: string }[]): string {
  return `
    <article class="journal-leaf journal-record" data-swatch="teal">
      <div class="journal-dateline"><span>Hari ${day}</span></div>
      <h3 class="journal-entry-heading">Rekap patroli</h3>
      <div class="journal-entry-detail">
        <dl class="journal-record-rows">
          ${rows.map(({ label, value }) => `<div><dt>${label}</dt><dd class="num">${value}</dd></div>`).join('')}
        </dl>
        ${renderJournalSketch('wave')}
      </div>
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
