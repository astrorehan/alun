import { TropicalAudio } from './audio';
import { GameSimulation } from './simulation';
import { INTRO } from './scene/director';
import type { Tier } from './scene/quality';
import { SceneRenderer } from './scene/SceneRenderer';
import { computeStats, createInitialProgress } from './upgrades';
import type { PlayerProgress, TimeOfDay, TrashRarity, UpgradeId } from './types';

/** Scene lab: the real simulation inside the 3D renderer, with knobs. Dev only, not part of the build. */
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('lab-canvas');
const audio = new TropicalAudio();
const renderer = new SceneRenderer(canvas);
const progress: PlayerProgress = createInitialProgress();
progress.shopUnlocked = true;
const sim = new GameSimulation(audio, () => {}, () => {}, () => {});

const setUp = (u: Partial<Record<UpgradeId, number>>): void => {
  Object.assign(progress.upgrades, u);
  sim.initLagoon(progress, computeStats(progress));
};
setUp({ wave_width: 2, wave_power: 2, tidal_charge: 1, net_expand: 1, trash_density: 2, ai_guide: 1 });

const step = (dt: number): void => {
  const stats = computeStats(progress);
  sim.update(dt * renderer.director.speed, progress, stats);
  renderer.render(sim, progress, stats, true);
};

const api = {
  sim,
  renderer,
  progress,
  setUp,
  paused: false,
  step,
  run(n: number, dt = 1 / 60): void {
    for (let i = 0; i < n; i++) step(dt);
  },
  swipe(x0: number, y0: number, x1: number, y1: number, charge = 0): void {
    sim.energy = 999;
    sim.launchPlayerWave(x0, y0, x1, y1, charge, progress, computeStats(progress));
  },
  tod(t: TimeOfDay | null): void {
    renderer.forceTod = t;
  },
};
/** A wave big enough to fill the frame, whatever the upgrades say. */
const bigWave = (x: number, y: number, tilt: number, width: number, charge: number): void => {
  const keep = { ...progress.upgrades };
  Object.assign(progress.upgrades, { wave_width: width, echo_wave: 0 });
  api.swipe(x, y, x - 200, y + tilt, charge);
  progress.upgrades = keep;
};
const flotsam = (n: number, x0: number, x1: number, y0: number, y1: number): void => {
  const any = sim as unknown as Record<string, (...a: unknown[]) => void>;
  for (let i = 0; i < n; i++) {
    any.spawnSingleTrash(computeStats(progress), true, i % 6 === 4 ? 'rare' : i % 3 === 2 ? 'uncommon' : 'common');
    const e = sim.entities[sim.entities.length - 1];
    e.x = x0 + ((i * 0.618) % 1) * (x1 - x0);
    e.y = y0 + ((i * 0.382 + 0.1) % 1) * (y1 - y0);
    e.vx = e.vy = 0;
    e.age = 2;
  }
};
renderer.director.onCue = (cue) => {
  if (cue === 'wave') {
    flotsam(9, 540, 690, 290, 420);
    bigWave(800, 356, 2, 5, 0.9);
  } else if (cue === 'wave2') {
    // a cut: start this take from a clean sheet
    sim.waves.length = 0;
    for (let i = sim.entities.length - 1; i >= 0; i--) if (sim.entities[i].kind.startsWith('trash_')) sim.entities.splice(i, 1);
    flotsam(6, 390, 470, 312, 398);
    bigWave(560, 352, 0, 2, 0.1);
  }
};

declare global {
  interface Window {
    __lab: typeof api;
  }
}
window.__lab = api;

/* ---------------------------------------------------------------- input */
canvas.addEventListener('pointerdown', (e) => {
  const p = renderer.screenToWorld(e.clientX, e.clientY);
  canvas.setPointerCapture(e.pointerId);
  sim.drag = { active: true, startX: p.x, startY: p.y, currX: p.x, currY: p.y, holdTime: 0, charge: 0, pointerId: e.pointerId };
});
canvas.addEventListener('pointermove', (e) => {
  if (!sim.drag.active) return;
  const p = renderer.screenToWorld(e.clientX, e.clientY);
  sim.drag.currX = p.x;
  sim.drag.currY = p.y;
});
canvas.addEventListener('pointerup', (e) => {
  if (!sim.drag.active) return;
  const p = renderer.screenToWorld(e.clientX, e.clientY);
  const d = sim.drag;
  d.active = false;
  sim.energy = 999;
  sim.launchPlayerWave(d.startX, d.startY, p.x, p.y, d.charge, progress, computeStats(progress));
});

/* ---------------------------------------------------------------- panel */
const pick = (group: string, b: HTMLElement | null): void => {
  for (const c of $(group).children) c.classList.toggle('sel', c === b);
};
const onButtons = (group: string, key: string, fn: (v: string, b: HTMLElement) => void): void => {
  $(group).addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (b) fn(b.dataset[key]!, b);
  });
};
const slider = (id: string, fmt: (v: number) => string, fn: (v: number) => void): void => {
  const el = $<HTMLInputElement>(id);
  const apply = (): void => {
    $(`${id}-v`).textContent = fmt(+el.value);
    fn(+el.value);
  };
  el.addEventListener('input', apply);
  apply();
};

onButtons('qual', 'q', (v, b) => {
  pick('qual', b);
  renderer.setQualitySetting(v as Tier, false);
});
const syncQualBtn = (): void => {
  const cur = renderer.getQualityState().tier;
  const b = $('qual').querySelector<HTMLElement>(`[data-q="${cur}"]`);
  pick('qual', b);
};
syncQualBtn();

onButtons('tod', 'tod', (v, b) => {
  pick('tod', b);
  renderer.forceTod = v as TimeOfDay;
});
renderer.forceTod = 'morning';
pick('tod', $('tod').firstElementChild as HTMLElement);

slider('eco', (v) => `${v}%`, (v) => (renderer.forceEco = v));
slider('net', (v) => `${v}`, (v) => (progress.upgrades.net_expand = v));
slider('pitch', (v) => `${v}°`, (v) => {
  renderer.director.pitch = v;
  renderer.director.fit(innerWidth / innerHeight);
});

let lane = 0;
onButtons('throw', 'c', (v) => {
  const y = [300, 400, 350, 450][lane++ % 4];
  if (v === 'tap') api.swipe(820, y, 822, y);
  else api.swipe(1010, y - 10, 780, y + 10, +v);
});

onButtons('cam', 'cam', (v) => {
  const d = renderer.director;
  if (v === 'cut') d.cutscene(INTRO);
  else d.setMode(v as 'play' | 'title', 2.8);
});

const RARE: TrashRarity[] = ['uncommon', 'rare', 'epic', 'legendary'];
onButtons('spawn', 's', (v) => {
  const any = sim as unknown as Record<string, (...a: unknown[]) => void>;
  if (v === 'buoy') {
    progress.upgrades.ai_buoy = ((progress.upgrades.ai_buoy ?? 0) % 3) + 1;
    any.syncAiBuoys(computeStats(progress));
  } else if (v === 'loot') for (const r of RARE) any.spawnSingleTrash(computeStats(progress), true, r);
  else any[`spawn${v}`]();
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'h') $('panel').classList.toggle('hide');
  else if (k === ' ') {
    api.paused = !api.paused;
    e.preventDefault();
  }
});
window.addEventListener('resize', () => {
  renderer.resize();
});

/* ---------------------------------------------------------------- loop */
let last = performance.now();
let ms = 16;
let shown = 0;
const loop = (now: number): void => {
  const raw = now - last;
  const dt = Math.min(0.05, Math.max(0.001, raw / 1000));
  last = now;
  if (!api.paused) {
    step(dt);
    ms += (raw - ms) * 0.05;
  }
  if (now - shown > 400) {
    shown = now;
    const i = renderer.info();
    $('stats').textContent = `${Math.round(1000 / ms)} fps · ${i.tier} · ${Math.round(i.scale * 100)}% res · ${(i.tris / 1e6).toFixed(2)}M tris`;
  }
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
