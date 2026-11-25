import type { GamePhase, PlayerProgress, ShopTab, UpgradeId } from './types';
import { ACHIEVEMENT_MAP, isAchievementClaimable } from './achievements';
import { TropicalAudio } from './audio';
import { GameSimulation } from './simulation';
import { GameUI } from './ui';
import type { QualitySetting, Tier } from './scene/quality';
import type { QualityState } from './scene/SceneRenderer';
import {
  computeStats,
  createInitialProgress,
  getMinUnlockableCost,
  getUpgradeCost,
  isUpgradeUnlocked,
  UPGRADE_DEFS,
  UPGRADE_MAP,
} from './upgrades';

const SAVE_KEY = 'alun_itrush_2026_v2';

function loadProgress(): { progress: PlayerProgress; hasSave: boolean } {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { progress: createInitialProgress(), hasSave: false };
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>;
    const base = createInitialProgress();
    const mergedUpgrades = { ...base.upgrades, ...(parsed.upgrades ?? {}) };
    mergedUpgrades.core = 1;
    for (const def of UPGRADE_DEFS) {
      if (typeof mergedUpgrades[def.id] !== 'number') {
        mergedUpgrades[def.id] = def.id === 'core' ? 1 : 0;
      }
    }
    const progress: PlayerProgress = {
      ...base,
      ...parsed,
      upgrades: mergedUpgrades,
      mangroves: Array.isArray(parsed.mangroves) ? parsed.mangroves : [],
      claimedAchievements: Array.isArray(parsed.claimedAchievements)
        ? parsed.claimedAchievements
        : [],
    };
    const hasSave = progress.totalCoinsEarned > 0 || progress.totalWaves > 0;
    return { progress, hasSave };
  } catch {
    return { progress: createInitialProgress(), hasSave: false };
  }
}

function saveProgress(progress: PlayerProgress): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage errors in restricted iframes
  }
}

interface GameRenderer {
  resize(): void;
  screenToWorld(clientX: number, clientY: number): { x: number; y: number };
  render(sim: GameSimulation, progress: PlayerProgress, stats: ReturnType<typeof computeStats>, isPlaying: boolean): void;
  setPhase?(phase: GamePhase): void;
  setSettingsOpen?(open: boolean): void;
  getQualityState?(): QualityState;
  setQualitySetting?(setting: QualitySetting, persist?: boolean): void;
  onQualityChange?: ((state: QualityState) => void) | null;
  onPerfHint?: ((suggested: Tier) => void) | null;
  onContextLost?: (() => void) | null;
  onContextRestored?: (() => void) | null;
}

class AlunApp {
  private canvas: HTMLCanvasElement;
  private audio: TropicalAudio;
  private renderer: GameRenderer;
  private sim: GameSimulation;
  private ui: GameUI;

  private progress: PlayerProgress;
  private hasSave: boolean;
  private phase: GamePhase = 'title';
  private lastFrameTime = performance.now();
  private autoSaveTimer = 0;
  private contextLostTimer: number | null = null;

  constructor(makeRenderer: (canvas: HTMLCanvasElement) => GameRenderer) {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.audio = new TropicalAudio();
    this.renderer = makeRenderer(this.canvas);

    const loaded = loadProgress();
    this.progress = loaded.progress;
    this.hasSave = loaded.hasSave;

    this.ui = new GameUI({
      onStartNew: () => {
        this.audio.unlock();
        this.progress = createInitialProgress();
        this.hasSave = false;
        saveProgress(this.progress);
        this.enterLagoon(true);
      },
      onContinue: () => {
        this.audio.unlock();
        this.enterLagoon(true);
      },
      onOpenShop: (tab?: ShopTab) => {
        if (this.phase === 'playing' && this.progress.shopUnlocked && !this.ui.isSettingsOpen()) {
          this.openShop(tab);
        }
      },
      onCloseShop: () => {
        if (this.phase === 'upgrade') {
          this.closeShop();
        }
      },
      onBuyUpgrade: (id: UpgradeId, originEl?: HTMLElement | null) => {
        this.buyUpgrade(id, originEl);
      },
      onClaimAchievement: (id: string, originEl?: HTMLElement | null) => {
        this.claimAchievement(id, originEl);
      },
      onToggleMute: () => {
        const muted = this.audio.toggleMute();
        this.ui.setMutedVisual(muted);
      },
      onResetSave: () => {
        try {
          localStorage.removeItem(SAVE_KEY);
        } catch {
          // Ignore storage errors
        }
        this.progress = createInitialProgress();
        this.hasSave = false;
        this.sim.lagoonInitialized = false;
        this.phase = 'title';
        this.ui.showPhase('title', false);
      },
      onStartEndless: () => {
        this.progress.endlessMode = true;
        saveProgress(this.progress);
        this.phase = 'playing';
        this.ui.showPhase('playing', true);
      },
      onOpenShopFromVictory: () => {
        this.progress.endlessMode = true;
        saveProgress(this.progress);
        this.openShop('cards');
      },
      onSelectQuality: (setting: QualitySetting) => {
        this.renderer.setQualitySetting?.(setting, true);
        const state = this.renderer.getQualityState?.();
        if (state) this.ui.updateQualityUI(state);
      },
      onSettingsToggle: (open: boolean) => {
        if (open) {
          this.sim.drag.active = false;
          this.sim.drag.pointerId = -1;
          const state = this.renderer.getQualityState?.();
          if (state) this.ui.updateQualityUI(state);
        }
        this.renderer.setSettingsOpen?.(open);
      },
      onTabSwitch: () => this.audio.playUiTab(),
      onUiClick: () => this.audio.playUiClick(),
      onUiError: () => this.audio.playUiError(),
    });

    this.renderer.onQualityChange = (state) => this.ui.updateQualityUI(state);
    this.renderer.onPerfHint = (suggested) => this.ui.showPerfHint(suggested);
    this.renderer.onContextLost = () => {
      this.sim.drag.active = false;
      this.sim.drag.pointerId = -1;
      this.ui.showWebglError(
        'Memulihkan Grafis 3D',
        'Koneksi ke kartu grafis terputus sementara. Sedang mencoba memulihkan tampilan...',
        'Progres permainanmu tetap tersimpan. Jika tidak pulih dalam beberapa detik, klik Coba Lagi.',
        true
      );
      if (this.contextLostTimer !== null) window.clearTimeout(this.contextLostTimer);
      this.contextLostTimer = window.setTimeout(() => {
        this.ui.showWebglError(
          'Konteks WebGL Terputus',
          'Browser tidak dapat memulihkan tampilan 3D secara otomatis.',
          'Progresmu sudah tersimpan aman. Muat ulang halaman atau turunkan kualitas grafis ke Rendah.',
          true
        );
      }, 4500);
    };
    this.renderer.onContextRestored = () => {
      if (this.contextLostTimer !== null) {
        window.clearTimeout(this.contextLostTimer);
        this.contextLostTimer = null;
      }
      this.ui.hideWebglError();
      this.ui.showToast('Tampilan 3D berhasil dipulihkan!', 'green');
    };
    const initialQuality = this.renderer.getQualityState?.();
    if (initialQuality) this.ui.updateQualityUI(initialQuality);

    this.sim = new GameSimulation(
      this.audio,
      (sender, text) => this.ui.showRadio(sender, text),
      () => this.handleVictory(),
      () => this.checkShopUnlock()
    );

    this.bindInputs();
    this.ui.showPhase('title', this.hasSave);

    requestAnimationFrame((t) => this.loop(t));
  }

  private enterLagoon(reinit: boolean): void {
    const stats = computeStats(this.progress);
    if (reinit || !this.sim.lagoonInitialized) {
      this.sim.initLagoon(this.progress, stats);
    }
    this.phase = 'playing';
    this.ui.showPhase('playing', true);
  }

  private checkShopUnlock(): void {
    if (this.progress.shopUnlocked) return;
    const minCost = getMinUnlockableCost(this.progress);
    if (this.progress.coins >= minCost) {
      this.progress.shopUnlocked = true;
      this.hasSave = true;
      saveProgress(this.progress);
      this.audio.playShopUnlock();
      this.ui.celebrate('Kalibrasi A.L.U.N. Terbuka! [Tab]', 'gold');
      this.ui.showRadio(
        'A.L.U.N. · KALIBRASI TERBUKA',
        'Koin cukup! Klik tombol Kalibrasi [Tab] kapan saja untuk meningkatkan ombak, debit muatan, & AI pemandu.'
      );
    }
  }

  private openShop(tab?: ShopTab): void {
    this.sim.drag.active = false;
    this.sim.drag.pointerId = -1;
    this.phase = 'upgrade';
    this.audio.playUiOpen();
    const stats = computeStats(this.progress);
    this.ui.renderUpgradeScreen(this.progress, stats, tab);
    this.ui.showPhase('upgrade', true);
  }

  private closeShop(): void {
    this.audio.playUiClose();
    this.phase = 'playing';
    this.ui.showPhase('playing', true);
  }

  private handleVictory(): void {
    this.hasSave = true;
    saveProgress(this.progress);
    this.phase = 'victory';
    this.ui.renderVictory(this.progress);
    this.ui.showPhase('victory', true);
    this.audio.setStormAmbience(0);
  }

  private buyUpgrade(id: UpgradeId, originEl?: HTMLElement | null): void {
    const lv = this.progress.upgrades[id] ?? 0;
    if (!isUpgradeUnlocked(id, this.progress.upgrades)) {
      this.audio.playUiError();
      return;
    }
    const cost = getUpgradeCost(id, lv);
    if (this.progress.coins < cost) {
      this.audio.playUiError();
      return;
    }

    this.progress.coins -= cost;
    this.progress.upgrades[id] = lv + 1;
    this.hasSave = true;
    saveProgress(this.progress);

    this.audio.playUpgradeBuy();
    const stats = computeStats(this.progress);
    this.sim.onUpgradePurchased(id, this.progress, stats);
    this.ui.celebrate(`${UPGRADE_MAP[id].name} Lv ${lv + 1}!`, 'green', originEl);
    this.ui.renderUpgradeScreen(this.progress, stats);
  }

  private claimAchievement(id: string, originEl?: HTMLElement | null): void {
    const def = ACHIEVEMENT_MAP[id];
    if (!def || !isAchievementClaimable(def, this.progress)) {
      this.audio.playUiError();
      return;
    }

    this.progress.claimedAchievements.push(def.id);
    this.progress.coins += def.rewardCoins;
    this.progress.totalCoinsEarned += def.rewardCoins;
    this.hasSave = true;
    saveProgress(this.progress);

    this.audio.playAchievementClaim();
    this.ui.celebrate(`+${def.rewardCoins.toLocaleString('id-ID')} Koin Pesisir!`, 'gold', originEl);

    const stats = computeStats(this.progress);
    this.ui.renderUpgradeScreen(this.progress, stats);
  }

  private bindInputs(): void {
    window.addEventListener('resize', () => {
      this.renderer.resize();
      const state = this.renderer.getQualityState?.();
      if (state) this.ui.updateQualityUI(state);
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.ui.isSettingsOpen()) {
          e.preventDefault();
          this.audio.playUiClick();
          this.ui.closeSettings();
          return;
        }
        if (this.ui.isCreditsOpen()) {
          e.preventDefault();
          this.audio.playUiClick();
          this.ui.closeCredits();
          return;
        }
        if (this.phase === 'upgrade') {
          e.preventDefault();
          this.closeShop();
          return;
        }
      }
      if (e.key === 'g' || e.key === 'G') {
        if (this.phase === 'playing' || this.phase === 'title') {
          if (this.ui.isCreditsOpen()) return;
          e.preventDefault();
          this.audio.playUiClick();
          if (this.ui.isSettingsOpen()) this.ui.closeSettings();
          else this.ui.openSettings();
          return;
        }
      }
      if (this.ui.isSettingsOpen()) return;

      if (e.key === 'm' || e.key === 'M') {
        const muted = this.audio.toggleMute();
        this.ui.setMutedVisual(muted);
      } else if (e.key === 'Tab' || e.key === 'e' || e.key === 'E') {
        if (this.phase === 'playing' && this.progress.shopUnlocked) {
          e.preventDefault();
          this.openShop();
        } else if (this.phase === 'upgrade') {
          e.preventDefault();
          this.closeShop();
        }
      } else if (this.phase === 'upgrade') {
        if (e.key === '1') this.ui.setShopTab('cards');
        else if (e.key === '2') this.ui.setShopTab('tree');
        else if (e.key === '3') this.ui.setShopTab('achievements');
      }
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (this.phase !== 'playing' || this.ui.isSettingsOpen()) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      const pos = this.renderer.screenToWorld(e.clientX, e.clientY);
      this.canvas.setPointerCapture(e.pointerId);
      this.sim.drag = {
        active: true,
        startX: pos.x,
        startY: pos.y,
        currX: pos.x,
        currY: pos.y,
        holdTime: 0,
        charge: 0,
        pointerId: e.pointerId,
      };
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.sim.drag.active || e.pointerId !== this.sim.drag.pointerId) return;
      const pos = this.renderer.screenToWorld(e.clientX, e.clientY);
      this.sim.drag.currX = pos.x;
      this.sim.drag.currY = pos.y;
    });

    const endDrag = (e: PointerEvent) => {
      if (!this.sim.drag.active || e.pointerId !== this.sim.drag.pointerId) return;
      const pos = this.renderer.screenToWorld(e.clientX, e.clientY);
      const { startX, startY, charge } = this.sim.drag;
      this.sim.drag.active = false;
      this.sim.drag.pointerId = -1;

      if (this.phase === 'playing' && !this.ui.isSettingsOpen()) {
        const stats = computeStats(this.progress);
        this.sim.launchPlayerWave(startX, startY, pos.x, pos.y, charge, this.progress, stats);
      }
    };

    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);
  }

  private loop(now: number): void {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;

    const stats = computeStats(this.progress);
    const activePlay = this.phase === 'playing' && !this.ui.isSettingsOpen();

    if (activePlay) {
      this.sim.update(dt, this.progress, stats);
      const boss = this.sim.getBossEntity();
      const bossRatio = boss ? boss.hp / boss.maxHp : null;
      this.ui.updateHud(
        this.progress,
        stats,
        this.sim.getTimeOfDay(this.progress, stats),
        this.sim.energy,
        this.sim.maxEnergy,
        this.sim.comboMult,
        this.sim.comboCount,
        bossRatio
      );

      this.autoSaveTimer += dt;
      if (this.autoSaveTimer >= 4) {
        this.autoSaveTimer = 0;
        if (this.progress.totalCoinsEarned > 0 || this.progress.totalWaves > 0) {
          this.hasSave = true;
          saveProgress(this.progress);
        }
      }
    } else if (!document.hidden) {
      this.sim.updateAmbientOnly(dt, this.progress, stats);
    }

    this.renderer.setPhase?.(this.phase);
    this.renderer.render(this.sim, this.progress, stats, activePlay);
    requestAnimationFrame((t) => this.loop(t));
  }
}

function showFatalError(title: string, msg: string, tip: string): void {
  document.getElementById('title-screen')?.classList.add('hidden');
  document.getElementById('hud')?.classList.add('hidden');
  const modal = document.getElementById('webgl-error-modal');
  if (!modal) return;
  const titleEl = document.getElementById('webgl-error-title');
  const msgEl = document.getElementById('webgl-error-msg');
  const tipEl = document.getElementById('webgl-error-tip');
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = msg;
  if (tipEl) tipEl.textContent = tip;
  document.getElementById('btn-webgl-retry')?.addEventListener('click', () => location.reload());
  modal.classList.remove('hidden');
}

async function acquireWebGL2(canvas: HTMLCanvasElement): Promise<WebGL2RenderingContext | null> {
  if (typeof WebGL2RenderingContext === 'undefined') return null;
  const attrs: WebGLContextAttributes = {
    antialias: true,
    alpha: false,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
  };
  // Hybrid-GPU browsers can return null briefly while the GPU process initializes on cold launch.
  for (let attempt = 0; attempt < 20; attempt++) {
    const gl = canvas.getContext('webgl2', attrs);
    if (gl && !gl.isContextLost()) return gl;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

async function bootApp(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const gl = canvas ? await acquireWebGL2(canvas) : null;
  if (!gl) {
    showFatalError(
      'WebGL2 Tidak Didukung',
      'Browser atau perangkat ini belum mengaktifkan WebGL2 yang dibutuhkan untuk menampilkan laguna 3D ALUN.',
      'Aktifkan Hardware Acceleration di pengaturan browser atau buka ALUN dengan Chrome, Edge, atau Firefox versi terbaru.'
    );
    return;
  }
  try {
    const { SceneRenderer } = await import('./scene/SceneRenderer');
    new AlunApp((c) => new SceneRenderer(c, gl));
  } catch (err) {
    console.error('[ALUN] 3D startup failed:', err);
    showFatalError(
      'Gagal Memuat Adegan 3D',
      'Modul grafis 3D tidak berhasil diunduh atau gagal dimulai pada browser ini.',
      'Periksa koneksi internet atau coba muat ulang halaman untuk memuat ulang permainan.'
    );
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => void bootApp(), { once: true });
} else {
  void bootApp();
}
