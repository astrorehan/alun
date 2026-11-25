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
  unlocked: boolean;
  canAfford: boolean;
  maxed: boolean;
  lockedReason?: string;
  cornerTag?: string;
  featured?: boolean;
}

export interface AchievementCardProps {
  id: string;
  title: string;
  desc: string;
  swatch: UiSwatch;
  icon: UiIconName;
  current: number;
  target: number;
  rewardCoins: number;
  claimed: boolean;
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
    !p.unlocked ? 'is-locked' : '',
    p.featured ? 'is-featured' : '',
    p.canAfford ? 'is-affordable' : '',
    p.maxed ? 'is-maxed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  let cornerHtml = '';
  if (p.maxed) {
    cornerHtml = `<span class="ui-corner-tag tag-max t-stroke-xs">MAKS!</span>`;
  } else if (!p.unlocked) {
    cornerHtml = `<span class="ui-corner-tag tag-lock t-stroke-xs">KUNCI</span>`;
  } else if (p.cornerTag) {
    cornerHtml = `<span class="ui-corner-tag t-stroke-xs">${p.cornerTag}</span>`;
  } else if (p.level === 0 && p.canAfford) {
    cornerHtml = `<span class="ui-corner-tag t-stroke-xs">BARU!</span>`;
  }

  const showSunburst = p.featured || p.canAfford || p.maxed;

  let ctaSwatch: UiSwatch = 'slate';
  let ctaContent = '';
  let ctaDisabled = 'disabled';

  if (p.maxed) {
    ctaSwatch = 'gold';
    ctaContent = `${getUiIconSvg('check', 'ui-btn-icon')}<span>MAKSIMAL</span>`;
    ctaDisabled = 'disabled';
  } else if (!p.unlocked) {
    ctaSwatch = 'slate';
    ctaContent = `${getUiIconSvg('lock', 'ui-btn-icon')}<span>${p.lockedReason ?? 'TERKUNCI'}</span>`;
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

  const statDeltaHtml = p.maxed
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
        ${p.featured || p.canAfford ? getUiIconSvg('sparkle', 'ui-sparkle sp-1') : ''}
        ${p.featured ? getUiIconSvg('sparkle', 'ui-sparkle sp-2') : ''}
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

/** Reusable Achievement Milestone Row Card (Exact Achievements Template) */
export function renderAchievementCard(p: AchievementCardProps): string {
  const clamped = Math.min(p.target, Math.floor(p.current));
  const pct = Math.max(0, Math.min(100, (clamped / Math.max(1, p.target)) * 100));
  const complete = clamped >= p.target;
  const canClaim = complete && !p.claimed;

  const btnSwatch: UiSwatch = p.claimed ? 'teal' : canClaim ? 'green' : 'slate';
  const btnLabel = p.claimed
    ? `${getUiIconSvg('check', 'ui-btn-icon')}<span>Diklaim</span>`
    : canClaim
      ? `<span>Klaim</span>${getUiIconSvg('coin', 'ui-btn-icon')}<span class="num">+${p.rewardCoins}</span>`
      : `${getUiIconSvg('coin', 'ui-btn-icon')}<span class="num">+${p.rewardCoins}</span>`;

  return `
    <article class="ui-achieve-card ${p.claimed ? 'is-claimed' : ''}" data-swatch="${p.swatch}">
      <div class="ui-achieve-medallion">
        ${getUiIconSvg(p.icon)}
      </div>
      <div class="ui-achieve-body">
        <div>
          <div class="ui-achieve-title t-stroke-md">${p.title}</div>
          <div class="ui-achieve-desc t-stroke-xs">${p.desc}</div>
        </div>
        <div class="ui-achieve-actions">
          <div class="ui-prog-pill">
            <div class="ui-prog-fill" style="width:${pct.toFixed(1)}%"></div>
            <span class="ui-prog-text t-stroke-xs num">${clamped.toLocaleString('id-ID')} / ${p.target.toLocaleString('id-ID')}</span>
          </div>
          <button
            type="button"
            class="ui-btn ui-claim-btn t-stroke-xs"
            data-swatch="${btnSwatch}"
            data-claim-id="${p.id}"
            ${canClaim ? '' : 'disabled'}
          >
            ${btnLabel}
          </button>
        </div>
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

/** Pop a crisp glossy floating pill toast at bottom-center */
let toastTimer: number | null = null;

export function showUiToast(text: string, swatch: UiSwatch = 'green', durationMs = 2400): void {
  const host = document.getElementById('ui-toast-host');
  if (!host) return;

  host.innerHTML = `<div class="ui-toast t-stroke-sm" data-swatch="${swatch}">${text}</div>`;
  host.classList.remove('hidden');

  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    host.classList.add('hidden');
  }, durationMs);
}
