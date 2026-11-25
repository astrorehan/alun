import fs from 'fs';

const tokens = fs.readFileSync('src/ui-kit/tokens.css', 'utf8');
const comps = fs.readFileSync('src/ui-kit/components.css', 'utf8');
const iconsSrc = fs
  .readFileSync('src/ui-kit/icons.ts', 'utf8')
  .replace(/export type UiIconName =[\s\S]*?;/, '')
  .replace(
    "export function getUiIconSvg(name: UiIconName, className = ''): string {",
    "function getUiIconSvg(name, className = '') {"
  );

const getIcon = new Function(iconsSrc + '\nreturn getUiIconSvg;')();

const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8" />
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Nunito:wght@700;800;900&display=swap" rel="stylesheet" />
<style>
${tokens}
${comps}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-body); color: #fff; }
.wrap { display: flex; flex-direction: column; gap: 20px; padding-right: 16px; padding-bottom: 6px; }
.sec-label { font-family: var(--font-display); font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted-foreground, #9bc0c7); margin-bottom: 8px; }
.hud-stage {
  border-radius: 18px;
  padding: 16px;
  background: radial-gradient(circle at 75% 40%, #1eaec0 0%, #0e6f8c 55%, #083d56 100%);
  border: 3px solid var(--ink);
  display: flex; flex-direction: column; gap: 18px;
}
.hud-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.hud-mid { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding-top: 8px; }
.modal-demo { position: relative; padding: 34px 16px 16px; margin-top: 18px; }
.cards-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
.ach-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
.ui-modal-frame, .ui-objective-banner, .ui-speech-bubble { animation: none; }
</style>
</head>
<body>
<div class="wrap">
  <div>
    <div class="sec-label">01 · IN-GAME HUD &amp; BANNER TEMPLATES</div>
    <div class="hud-stage">
      <div class="hud-row">
        <div class="ui-currency-pill">
          <span class="ui-currency-icon">${getIcon('coin')}</span>
          <span class="ui-currency-val t-stroke-md t-lime num">1.420</span>
          <div class="ui-delta-stack" style="top:-18px;"><span class="t-stroke-xs t-lime" style="font-size:13px;">+$40</span></div>
        </div>
        <div class="ui-meter-pill" data-swatch="blue">
          <div class="ui-meter-badge" data-swatch="blue">${getIcon('wave')}</div>
          <div class="ui-meter-content">
            <div class="ui-meter-top">
              <span class="ui-meter-label t-stroke-xs">Energi Ombak</span>
              <span class="ui-meter-num t-stroke-xs t-gold num">140/170</span>
            </div>
            <div class="ui-bar-track"><div class="ui-bar-fill" data-swatch="orange" style="width:82%"></div></div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="ui-square-btn" data-swatch="dark">${getIcon('sound_on')}</div>
          <div class="ui-time-pill" data-swatch="blue">${getIcon('sun')}<span class="ui-time-text t-stroke-sm">PAGI CERAH</span></div>
        </div>
      </div>

      <div class="hud-mid">
        <div class="ui-objective-banner" data-swatch="orange">
          <span class="ui-objective-kicker t-stroke-xs">MISI AKTIF</span>
          <div class="ui-objective-icon">${getIcon('coin')}</div>
          <div class="ui-objective-copy">
            <div class="ui-objective-title t-stroke-md">Kumpulkan 20 Koin</div>
            <div class="ui-objective-sub t-stroke-xs">Sapukan limbah ke Jaring Desa!</div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
          <div class="ui-slim-bar-wrap">
            <div class="ui-slim-bar-track"><div class="ui-slim-bar-fill" data-swatch="green" style="width:68%"></div><span class="ui-slim-bar-val t-stroke-xs num">68% · 7 Pohon</span></div>
            <div class="ui-slim-bar-medallion" data-swatch="green">${getIcon('mangrove')}</div>
          </div>
          <button class="ui-btn t-stroke-sm" data-swatch="gold">
            <span class="ui-btn-icon">${getIcon('shop')}</span><span>KALIBRASI</span><span class="ui-notif-badge">4</span>
          </button>
        </div>
      </div>

      <div class="hud-row">
        <div class="ui-keycap-group">
          <span class="ui-keycap t-stroke-xs">Geser</span>
          <span class="ui-keycap-pill t-stroke-xs" data-swatch="blue">Sapu Ombak</span>
          <span class="ui-keycap t-stroke-xs">Tab</span>
          <span class="ui-keycap-pill t-stroke-xs" data-swatch="gold">Kalibrasi</span>
        </div>
        <div class="ui-speech-bubble" style="max-width:295px;">
          <div class="ui-speech-sender t-stroke-xs">A.L.U.N.</div>
          <div class="ui-speech-text">Arus pasang membawa muatan langka ke laguna!</div>
        </div>
      </div>
    </div>
  </div>

  <div>
    <div class="sec-label">02 · MODAL SHELL, TABS, CHECKERED CARDS &amp; ACHIEVEMENTS TEMPLATES</div>
    <div class="ui-modal-frame ui-shell-navy modal-demo">
      <div class="ui-modal-ribbon" data-swatch="orange">
        <span class="ui-modal-ribbon-title t-stroke-lg">Toko Kalibrasi A.L.U.N.</span>
      </div>
      <button class="ui-close-btn">${getIcon('close')}</button>

      <div style="display:flex;justify-content:center;">
        <div class="ui-tab-bar">
          <button class="ui-tab t-stroke-sm is-active" data-swatch="purple"><span class="ui-btn-icon">${getIcon('shop')}</span><span>Kartu Upgrade</span><span class="ui-notif-badge">4</span></button>
          <button class="ui-tab t-stroke-sm" data-swatch="slate"><span class="ui-btn-icon">${getIcon('tree')}</span><span>Pohon Evolusi</span></button>
          <button class="ui-tab t-stroke-sm" data-swatch="slate"><span class="ui-btn-icon">${getIcon('trophy')}</span><span>Pencapaian</span><span class="ui-notif-badge">2</span></button>
        </div>
      </div>

      <div class="cards-3">
        <article class="ui-upgrade-card is-affordable" data-swatch="blue">
          <div class="ui-card-head"><span class="ui-card-title t-stroke-md">Bentang Ombak</span></div>
          <div class="ui-card-stage">
            <div class="ui-sunburst"></div>
            ${getIcon('sparkle', 'ui-sparkle sp-1')}
            ${getIcon('width', 'ui-card-art')}
            <div class="ui-star-row">${getIcon('star_on', 'ui-star-pip')}${getIcon('star_on', 'ui-star-pip')}${getIcon('star_off', 'ui-star-pip')}${getIcon('star_off', 'ui-star-pip')}${getIcon('star_off', 'ui-star-pip')}</div>
          </div>
          <div class="ui-card-meta">
            <div class="ui-stat-kicker t-stroke-xs">${getIcon('width')}<span>LEBAR OMBAK</span></div>
            <div class="ui-stat-delta num"><span class="t-stroke-sm">x1.52</span>${getIcon('arrow_right', 'ui-arrow-icon')}<span class="t-stroke-sm t-lime">x1.78</span></div>
          </div>
          <button class="ui-btn ui-btn-block ui-card-cta t-stroke-md" data-swatch="green">${getIcon('coin', 'ui-btn-icon')}<span>61</span></button>
        </article>

        <article class="ui-upgrade-card is-featured is-affordable" data-swatch="gold">
          <div class="ui-card-head"><span class="ui-card-title t-stroke-md">Kelangkaan Muatan</span></div>
          <div class="ui-card-stage">
            <div class="ui-sunburst"></div>
            <span class="ui-corner-tag t-stroke-xs">OP VALUE!</span>
            ${getIcon('sparkle', 'ui-sparkle sp-1')}${getIcon('sparkle', 'ui-sparkle sp-2')}
            ${getIcon('rarity', 'ui-card-art')}
            <div class="ui-star-row">${getIcon('star_on', 'ui-star-pip')}${getIcon('star_on', 'ui-star-pip')}${getIcon('star_on', 'ui-star-pip')}${getIcon('star_off', 'ui-star-pip')}${getIcon('star_off', 'ui-star-pip')}</div>
          </div>
          <div class="ui-card-meta">
            <div class="ui-stat-kicker t-stroke-xs">${getIcon('rarity')}<span>KELANGKAAN</span></div>
            <div class="ui-stat-delta num"><span class="t-stroke-sm">EPIK</span>${getIcon('arrow_right', 'ui-arrow-icon')}<span class="t-stroke-sm t-lime">LEGEND</span></div>
          </div>
          <button class="ui-btn ui-btn-block ui-card-cta t-stroke-md" data-swatch="green">${getIcon('coin', 'ui-btn-icon')}<span>385</span></button>
        </article>

        <article class="ui-upgrade-card is-featured" data-swatch="teal">
          <div class="ui-card-head"><span class="ui-card-title t-stroke-md">AI Arus Pemandu</span></div>
          <div class="ui-card-stage">
            <div class="ui-sunburst"></div>
            <span class="ui-corner-tag t-stroke-xs">AI SMART!</span>
            ${getIcon('magnet', 'ui-card-art')}
            <div class="ui-star-row">${getIcon('star_on', 'ui-star-pip')}${getIcon('star_off', 'ui-star-pip')}${getIcon('star_off', 'ui-star-pip')}${getIcon('star_off', 'ui-star-pip')}</div>
          </div>
          <div class="ui-card-meta">
            <div class="ui-stat-kicker t-stroke-xs">${getIcon('magnet')}<span>PANDUAN AI</span></div>
            <div class="ui-stat-delta num"><span class="t-stroke-sm">+36%</span>${getIcon('arrow_right', 'ui-arrow-icon')}<span class="t-stroke-sm t-lime">+72%</span></div>
          </div>
          <button class="ui-btn ui-btn-block ui-card-cta t-stroke-md" data-swatch="slate" disabled>${getIcon('coin', 'ui-btn-icon')}<span>96</span></button>
        </article>
      </div>

      <div class="ach-2">
        <article class="ui-achieve-card" data-swatch="green">
          <div class="ui-achieve-medallion">${getIcon('wave')}</div>
          <div class="ui-achieve-body">
            <div>
              <div class="ui-achieve-title t-stroke-md">Sapuan Pertama</div>
              <div class="ui-achieve-desc t-stroke-xs">Kirim 5 sapuan ombak di laguna</div>
            </div>
            <div class="ui-achieve-actions">
              <div class="ui-prog-pill"><div class="ui-prog-fill" style="width:100%"></div><span class="ui-prog-text t-stroke-xs num">5 / 5</span></div>
              <button class="ui-btn ui-claim-btn t-stroke-xs" data-swatch="green"><span>Klaim</span>${getIcon('coin', 'ui-btn-icon')}<span>+25</span></button>
            </div>
          </div>
        </article>

        <article class="ui-achieve-card" data-swatch="blue">
          <div class="ui-achieve-medallion">${getIcon('rarity')}</div>
          <div class="ui-achieve-body">
            <div>
              <div class="ui-achieve-title t-stroke-md">Pemburu Langka</div>
              <div class="ui-achieve-desc t-stroke-xs">Panen 5 muatan Langka/Epik/Legend</div>
            </div>
            <div class="ui-achieve-actions">
              <div class="ui-prog-pill"><div class="ui-prog-fill" style="width:60%"></div><span class="ui-prog-text t-stroke-xs num">3 / 5</span></div>
              <button class="ui-btn ui-claim-btn t-stroke-xs" data-swatch="slate" disabled>${getIcon('coin', 'ui-btn-icon')}<span>+130</span></button>
            </div>
          </div>
        </article>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;

fs.writeFileSync('concepts/ui_template_showcase.html', html, 'utf8');
console.log('Generated concepts/ui_template_showcase.html', html.length);
