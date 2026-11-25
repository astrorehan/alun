import type { GamePhase, PlayerProgress, ShopTab, UpgradeId } from './types';
import { ACHIEVEMENT_MAP, isAchievementClaimable } from './achievements';
import { TropicalAudio } from './audio';
import { GameSimulation } from './simulation';
import { GameUI } from './ui';
import type { OpeningHooks } from './scene/opening';
import type { RescueHooks } from './scene/rescue';
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
  playOpening?(sim: GameSimulation, stats: ReturnType<typeof computeStats>, hooks: OpeningHooks, done: () => void): void;
  skipOpening?(): void;
  playRescue?(sim: GameSimulation, id: number, hooks: RescueHooks): void;
  skipRescueFilm?(): void;
  cancelRescue?(): void;
  rescueHint?(): { ax: number; ay: number; bx: number; by: number } | null;
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
  /** The dolphin event: its films ('film', 'free') take the controls away, 'help' is played as normal. */
  private rescue: 'film' | 'help' | 'free' | null = null;
  /** Seconds actually spent playing since the lagoon was entered; the dolphin waits for some. */
  private playSeconds = 0;
  /** Birdsong the opening asks for while it runs. */
  private introBirds = 0.8;
  private clock = 0;

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
        this.cancelRescue();
        this.startOpening();
      },
      onSkipIntro: () => this.skipFilm(),
      onContinue: () => {
        this.audio.unlock();
        this.cancelRescue();
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
        this.cancelRescue();
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
    this.playSeconds = 0;
    this.phase = 'playing';
    this.ui.showPhase('playing', true);
  }

  /**
   * A new game opens on a short film: the lagoon as it was, the tourists who spoil it, and A.L.U.N.
   * waking up. The trash they throw is the trash the player starts with.
   */
  private startOpening(): void {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (!this.renderer.playOpening || reduceMotion) {
      this.enterLagoon(true);
      return;
    }
    const stats = computeStats(this.progress);
    this.sim.initLagoon(this.progress, stats, true);
    this.phase = 'intro';
    this.ui.showPhase('intro', this.hasSave);
    this.renderer.playOpening(
      this.sim,
      stats,
      {
        caption: (kicker, line) => this.ui.setIntroCaption(kicker, line),
        sound: (kind, strength) => {
          if (kind === 'splash') this.audio.playSplash(strength);
          else if (kind === 'throw') this.audio.playToss();
          else this.audio.playAlunWake();
        },
        motor: (level) => this.audio.setMotor(level),
        birds: (level) => (this.introBirds = level),
      },
      () => this.finishOpening()
    );
  }

  /** Whatever film is running (the opening, or one of the dolphin's), skip to its end. */
  private skipFilm(): void {
    if (this.phase === 'intro') {
      this.audio.playUiClick();
      this.renderer.skipOpening?.();
    } else if (this.rescue === 'film' || this.rescue === 'free') {
      this.audio.playUiClick();
      this.renderer.skipRescueFilm?.();
    }
  }

  /** Runs when the film ends or is skipped: hand the lagoon over, then A.L.U.N. explains what to do. */
  private finishOpening(): void {
    if (this.phase !== 'intro') return;
    this.audio.setMotor(0);
    this.playSeconds = 0;
    this.phase = 'playing';
    this.ui.showPhase('playing', true);
    this.sim.greet(this.progress);
  }

  /**
   * The dolphin waits until the player has their hands on the game: some time actually playing, a few
   * pieces of trash in, and no storm or other film in the way. Once per save.
   */
  private maybeStartRescue(dt: number): void {
    if (this.rescue || this.progress.dolphinRescued || !this.renderer.playRescue) return;
    this.playSeconds += dt;
    if (this.playSeconds < 40 || this.progress.totalTrash < 8) return;
    if (this.sim.bossActive || this.sim.drag.active) return;
    this.startRescue();
  }

  private startRescue(): void {
    if (!this.renderer.playRescue) return;
    const e = this.sim.spawnDolphin();
    this.rescue = 'film';
    this.sim.drag.active = false;
    this.sim.drag.pointerId = -1;
    this.ui.setFilm(true);
    this.audio.playAlert();
    const total = e.maxHp;
    const objective = (done: number): void =>
      this.ui.setEventObjective({
        title: 'Selamatkan Lumba-lumba!',
        sub: `Geser ombak ke arahnya untuk merobek jaring · ${done}/${total}`,
        icon: 'dolphin',
        swatch: 'teal',
      });
    this.renderer.playRescue(this.sim, e.id, {
      caption: (kicker, line) => this.ui.setIntroCaption(kicker, line),
      sound: (kind, strength) => {
        if (kind === 'distress') this.audio.playDolphin('distress');
        else if (kind === 'happy') {
          this.audio.playDolphin('happy');
          this.audio.playAchievementClaim();
          this.audio.playBirdBurst(1);
        } else if (kind === 'snap') this.audio.playNetSnap(strength);
        else this.audio.playSplash(strength * 1.2);
      },
      help: () => {
        this.rescue = 'help';
        this.ui.setFilm(false);
        objective(0);
        this.ui.showRadio(
          'A.L.U.N. · DARURAT',
          'Lumba-lumba terjerat jaring hantu! Geser dari air ke arahnya. Tahan dulu sebelum melepas: ombak kuat merobek lebih banyak.'
        );
      },
      hit: (left) => objective(total - left),
      freed: () => {
        this.rescue = 'free';
        this.sim.drag.active = false;
        this.sim.drag.pointerId = -1;
        this.ui.setEventObjective(null);
        this.ui.setFilm(true);
        this.hasSave = true;
        saveProgress(this.progress);
      },
      done: () => {
        this.rescue = null;
        this.ui.setFilm(false);
        this.ui.showRadio(
          'BU SARI · WARGA PESISIR',
          'Terima kasih! Lumba-lumba itu sudah bebas. Sisa jaringnya masih mengapung, sapu ke Jaring Desa ya!'
        );
        this.audio.playBirdBurst(0.6);
      },
    });
  }

  /** Puts the dolphin event away without a word (new game, reset, continue). */
  private cancelRescue(): void {
    if (!this.rescue) return;
    this.rescue = null;
    this.renderer.cancelRescue?.();
    this.ui.setEventObjective(null);
    this.ui.updateRescueHint(null, 0);
    this.ui.setFilm(false);
  }

  /** How much birdsong fits this moment: a dawn chorus on the title, more birds as the lagoon recovers, none in a storm. */
  private birdsNow(stats: ReturnType<typeof computeStats>): { level: number; gulls: number } {
    if (this.phase === 'title') return { level: 0.55, gulls: 0.35 };
    if (this.phase === 'intro') return { level: this.introBirds, gulls: 0.3 };
    if (this.phase === 'victory') return { level: 1, gulls: 0.4 };
    const tod = this.sim.getTimeOfDay(this.progress, stats);
    if (tod === 'monsoon') return { level: 0, gulls: 0 };
    const eco = stats.ecoPercent / 100;
    let level = tod === 'dawn' ? 0.95 : tod === 'sunset' ? 0.1 + 0.4 * eco : 0.15 + 0.85 * eco;
    // the whole lagoon holds its breath while the dolphin is in trouble
    if (this.rescue === 'film') level *= 0.25;
    if (this.phase === 'upgrade') level *= 0.6;
    return { level, gulls: tod === 'sunset' ? 0.2 : 0.45 };
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

    // the opening pauses with the tab, and so should its boat's engine
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.audio.setMotor(0);
    });

    window.addEventListener('keydown', (e) => {
      // during a film the only keys that do anything are skip and mute
      if (this.phase === 'intro' || this.rescue === 'film' || this.rescue === 'free') {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.skipFilm();
        } else if (e.key === 'm' || e.key === 'M') {
          this.ui.setMutedVisual(this.audio.toggleMute());
        } else if (e.key === 'Tab') {
          e.preventDefault();
        }
        return;
      }
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
      if (this.rescue === 'film' || this.rescue === 'free') return;
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
    this.clock += dt;

    if (activePlay) {
      this.sim.update(dt, this.progress, stats);
      this.maybeStartRescue(dt);
      // until the first piece of net comes off, show the swipe that does it
      this.ui.updateRescueHint(this.rescue === 'help' ? (this.renderer.rescueHint?.() ?? null) : null, this.clock);
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
      // under the opening the tourists' rubbish bobs where it fell; nothing is collected yet
      if (this.phase === 'intro') this.sim.drift(dt);
    }
    if (!activePlay) this.ui.updateRescueHint(null, this.clock);
    if (!document.hidden) {
      const birds = this.birdsNow(stats);
      this.audio.updateBirds(dt, birds.level, birds.gulls);
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
