import type { Objective } from './story/jobs';
import { LandscapeMode } from './landscape';
import type { Entity, GamePhase, PlayerProgress, ShopTab, UpgradeId } from './types';
import { TropicalAudio } from './audio';
import { markRead } from './journal';
import { browserStore, clearGame, loadGame, saveGame } from './save';
import { GameSimulation } from './simulation';
import { chapterTitle, PATROL, whereAt } from './story/state';
import { GameUI } from './ui';
import type { EndingHooks } from './scene/ending';
import type { OpeningHooks } from './scene/opening';
import type { PirateHooks } from './scene/pirates';
import type { RescueHooks } from './scene/rescue';
import type { QualitySetting, Tier } from './scene/quality';
import type { QualityState } from './scene/SceneRenderer';
import { computeStats, createInitialProgress, getUpgradeCost, isForSale, UPGRADE_MAP } from './upgrades';

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
  /** Where a place in the lagoon is on the page, in CSS pixels. */
  worldToScreen?(x: number, y: number): { x: number; y: number } | null;
  playEnding?(sim: GameSimulation, hooks: EndingHooks, done: () => void): void;
  skipEnding?(): void;
  playPirates?(sim: GameSimulation, id: number, hooks: PirateHooks, done: () => void): void;
  skipPiratesFilm?(): void;
  cancelPirates?(): void;
  readonly piratesActive?: boolean;
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
  private landscape: LandscapeMode;

  private readonly store = browserStore();
  private progress: PlayerProgress;
  private hasSave: boolean;
  private phase: GamePhase = 'title';
  private lastFrameTime = performance.now();
  private autoSaveTimer = 0;
  private contextLostTimer: number | null = null;
  /** The dolphin event: its films ('film', 'free') take the controls away, 'help' is played as normal. */
  private rescue: 'film' | 'help' | 'free' | null = null;
  /** The closing film is running. */
  private ending = false;
  /** The film that introduces the raiders' crew is running. */
  private pirates = false;
  /** The browser refused to keep the last save. */
  private saveFailed = false;
  /** Birdsong the opening asks for while it runs. */
  private introBirds = 0.8;

  constructor(makeRenderer: (canvas: HTMLCanvasElement) => GameRenderer) {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.audio = new TropicalAudio();
    this.renderer = makeRenderer(this.canvas);

    const loaded = loadGame(this.store);
    this.progress = loaded.progress;
    this.hasSave = loaded.hasSave;

    this.ui = new GameUI({
      onStartNew: () => {
        void this.landscape.request();
        this.audio.unlock();
        if (this.hasSave) {
          this.ui.confirm(
            'Mulai cerita baru?',
            `Cerita yang sedang berjalan (${this.savedPlace()}) akan diganti. Koin, alat dan pantainya mulai dari awal.`,
            'Mulai Baru',
            () => this.newGame()
          );
          return;
        }
        this.newGame();
      },
      onSkipIntro: () => this.skipFilm(),
      onContinue: () => {
        void this.landscape.request();
        this.audio.unlock();
        this.cancelRescue();
        this.cancelPirates();
        this.enterLagoon(true);
      },
      onOpenShop: (tab?: ShopTab) => {
        if (this.phase === 'playing' && this.progress.shopUnlocked && !this.ui.isSettingsOpen() && !this.ending) {
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
      onAnswerCall: (originEl?: HTMLElement | null) => {
        if (!this.sim.story.answerCall()) return;
        this.save();
        this.audio.playShopUnlock();
        this.ui.celebrate('Panggilan dijawab. Kembali ke laguna!', 'red', originEl);
        this.ui.renderUpgradeScreen(this.progress, computeStats(this.progress), this.sim.story.headline());
      },
      onReadJournal: (part) => {
        markRead(this.progress, part);
        this.save();
      },
      onToggleMute: () => {
        const muted = this.audio.toggleMute();
        this.ui.setMutedVisual(muted);
      },
      onResetSave: () => {
        this.ui.confirm(
          'Hapus simpanan?',
          `Cerita (${this.savedPlace()}), koin dan alat dihapus dari browser ini.`,
          'Hapus',
          () => {
            clearGame(this.store);
            this.progress = createInitialProgress();
            this.hasSave = false;
            this.cancelRescue();
            this.cancelPirates();
            // the title's lagoon is the empty one again, not the one that was being played
            this.sim.initLagoon(this.progress, computeStats(this.progress), true);
            this.sim.lagoonInitialized = false;
            this.phase = 'title';
            this.audio.setShopDuck(false);
            this.ui.forgetProgress();
            this.showTitle();
          }
        );
      },
      onStartEndless: () => {
        this.progress.endlessMode = true;
        this.save();
        this.phase = 'playing';
        this.ui.showPhase('playing');
      },
      onOpenShopFromVictory: () => {
        this.progress.endlessMode = true;
        this.save();
        this.openShop('tree');
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
          this.audio.setWaveCharge(0);
          const state = this.renderer.getQualityState?.();
          if (state) this.ui.updateQualityUI(state);
        }
        this.audio.setShopDuck(open);
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

    this.sim = new GameSimulation(this.audio, {
      radio: (sender, text) => this.ui.showRadio(sender, text, this.progress.story.chapter <= 4),
      coins: () => {},
      save: () => this.save(),
      chapter: (n) => this.ui.showChapter(n),
      celebrate: (text, swatch) => this.ui.celebrate(text, swatch),
      dolphin: (e) => this.startRescue(e),
      raider: (e) => this.startPirates(e),
      filming: () => this.rescue !== null || this.pirates,
      worsen: (kind) => {
        if (kind !== 'trash') this.ui.pulseHealth();
      },
      ending: () => this.startEnding(),
    });

    this.landscape = new LandscapeMode(() => {
      this.sim.drag.active = false;
      this.sim.drag.pointerId = -1;
      this.audio.setWaveCharge(0);
      this.audio.setMotor(0);
    });
    this.bindInputs();
    this.showTitle();

    requestAnimationFrame((t) => this.loop(t));
  }

  /** The chapter the save will land in, also for one from before the story. */
  private savedChapter(): number {
    const s = this.progress.story;
    return s.step === 'migrated' ? whereAt(s.flags, s.openingLeft).chapter : s.chapter;
  }

  /** The same, the way a player would say it. */
  private savedPlace(): string {
    const n = this.savedChapter();
    return n >= PATROL ? chapterTitle(n) : `bab ${n}, ${chapterTitle(n)}`;
  }

  private showTitle(): void {
    this.ui.setTitleSave(this.hasSave ? chapterTitle(this.savedChapter()) : null);
    this.ui.showPhase('title');
  }

  /** Everything of one moment, written in one go. Says so when the browser will not keep it. */
  private save(): void {
    // under the opening the water holds the film's own rubbish, and none of it belongs in a save
    const live = this.phase !== 'intro' && this.sim.lagoonInitialized && this.sim.progress === this.progress;
    if (live) this.sim.story.snapshot();
    const ok = saveGame(this.store, this.progress);
    this.hasSave = this.hasSave || ok;
    if (!ok !== this.saveFailed) {
      this.saveFailed = !ok;
      this.ui.setSaveWarning(this.saveFailed);
    }
  }

  private newGame(): void {
    clearGame(this.store);
    this.progress = createInitialProgress();
    this.hasSave = false;
    this.ui.forgetProgress();
    this.cancelRescue();
    this.cancelPirates();
    this.sim.lagoonInitialized = false;
    this.save();
    this.startOpening();
  }

  private enterLagoon(reinit: boolean): void {
    const stats = computeStats(this.progress);
    if (reinit || !this.sim.lagoonInitialized) {
      this.sim.initLagoon(this.progress, stats);
    }
    this.phase = 'playing';
    this.ui.showPhase('playing');
    // a story that stopped in the middle of the dolphin's film picks it up again
    this.ui.showChapter(this.progress.story.chapter);
    if (this.rescue === 'film') this.ui.setFilm(true);
    this.save();
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
    this.ui.showPhase('intro');
    // the film has its own quiet music; the playlist waits for the lagoon
    this.audio.holdMusic(true);
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
        score: (t) => this.audio.openingScore(t),
      },
      () => this.finishOpening()
    );
  }

  /** Whatever film is running (the opening, or one of the dolphin's), skip to its end. */
  private skipFilm(): void {
    if (this.phase === 'intro') {
      this.audio.playUiClick();
      this.audio.endOpeningScore(true);
      this.renderer.skipOpening?.();
    } else if (this.pirates) {
      this.audio.playUiClick();
      this.renderer.skipPiratesFilm?.();
    } else if (this.ending) {
      this.audio.playUiClick();
      this.renderer.skipEnding?.();
    } else if (this.rescue === 'film' || this.rescue === 'free') {
      this.audio.playUiClick();
      this.renderer.skipRescueFilm?.();
    }
  }

  /** Runs when the film ends or is skipped: hand the lagoon over, then Bu Sari says what is wrong. */
  private finishOpening(): void {
    if (this.phase !== 'intro') return;
    this.audio.setMotor(0);
    // the last chord rings out while the lagoon's own music comes up under it
    this.audio.endOpeningScore();
    this.audio.holdMusic(false);
    this.sim.story.layOpening();
    this.phase = 'playing';
    this.ui.showPhase('playing');
    this.ui.showChapter(1);
    this.sim.greet();
    this.save();
  }

  /** The mother dolphin's film. False when there is none to show, and the story goes on without it. */
  private startRescue(e: Entity): boolean {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (!this.renderer.playRescue || reduceMotion) return false;
    this.rescue = 'film';
    this.sim.drag.active = false;
    this.sim.drag.pointerId = -1;
    this.ui.setFilm(true);
    this.audio.playAlert();
    this.renderer.playRescue(this.sim, e.id, {
      caption: (kicker, line) => this.ui.setIntroCaption(kicker, line),
      sound: (kind, strength) => {
        if (kind === 'distress') this.audio.playDolphin('distress');
        else if (kind === 'happy') {
          this.audio.playDolphin('happy');
          this.audio.playBirdBurst(1);
        } else if (kind === 'snap') this.audio.playNetSnap(strength);
        else this.audio.playSplash(strength * 1.2);
      },
      help: () => {
        this.rescue = 'help';
        this.ui.setFilm(false);
        this.ui.showRadio(
          'A.L.U.N.',
          'Jaringnya melilit tubuh induk. Kirim ombak mengikuti panah sampai ia bebas.',
          true
        );
      },
      freed: () => {
        this.rescue = 'free';
        this.sim.drag.active = false;
        this.sim.drag.pointerId = -1;
        this.ui.setFilm(true);
        this.save();
      },
      done: () => {
        this.rescue = null;
        this.ui.setFilm(false);
        this.sim.story.afterDolphin();
        this.audio.playBirdBurst(0.6);
        this.save();
      },
    });
    return true;
  }

  /**
   * The first raider of the story: the camera swings out to the ship, shows its crew of pirates and looks
   * through the captain's spyglass at the baskets on the pier. False when there is no film to show.
   */
  private startPirates(e: Entity): boolean {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (!this.renderer.playPirates || reduceMotion || this.phase !== 'playing') return false;
    this.pirates = true;
    this.sim.drag.active = false;
    this.sim.drag.pointerId = -1;
    this.audio.setWaveCharge(0);
    this.audio.holdMusic(true);
    this.ui.setFilm(true);
    this.renderer.playPirates(
      this.sim,
      e.id,
      {
        caption: (kicker, line) => this.ui.setIntroCaption(kicker, line),
        sound: (kind, strength) => {
          if (kind === 'drum') this.audio.playWarDrum(strength);
          else if (kind === 'horn') this.audio.playPirateHorn();
          else if (kind === 'glass') this.audio.playSpyglass();
          else if (kind === 'tension') this.audio.playTension();
          else this.audio.playAlunWake();
        },
        scope: (open, on) => this.ui.setSpyglass(open, on),
      },
      () => this.finishPirates()
    );
    return true;
  }

  /** The film is over or skipped: back to the lagoon, where Bu Sari's warning is waiting. */
  private finishPirates(): void {
    if (!this.pirates) return;
    this.pirates = false;
    this.ui.setSpyglass(0, false);
    this.ui.setFilm(false);
    this.audio.holdMusic(false);
    this.save();
  }

  /** Puts the pirates' film away without a word (new game, reset, continue). */
  private cancelPirates(): void {
    if (!this.pirates) return;
    this.pirates = false;
    this.renderer.cancelPirates?.();
    this.ui.setSpyglass(0, false);
    this.ui.setFilm(false);
    this.audio.holdMusic(false);
  }

  /** The story is over: dawn, Pak Damar at the pier, the dolphins beside him. */
  private startEnding(): void {
    this.save();
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.sim.drag.active = false;
    this.sim.drag.pointerId = -1;
    if (!this.renderer.playEnding || reduceMotion) {
      this.handleVictory();
      return;
    }
    this.ending = true;
    this.ui.setFilm(true);
    this.renderer.playEnding(
      this.sim,
      {
        caption: (kicker, line) => this.ui.setIntroCaption(kicker, line),
        sound: (kind) => {
          if (kind === 'dolphin') this.audio.playDolphin('happy');
          else if (kind === 'birds') this.audio.playBirdBurst(1);
          else this.audio.playBoatSaved(-0.4);
        },
      },
      () => {
        this.ending = false;
        this.ui.setFilm(false);
        this.handleVictory();
      }
    );
  }

  /** Puts the dolphin event away without a word (new game, reset, continue). */
  private cancelRescue(): void {
    if (!this.rescue) return;
    this.rescue = null;
    this.renderer.cancelRescue?.();
    this.ui.updateSwipeHint(null);
    this.ui.setFilm(false);
  }

  /** How much birdsong fits this moment: a dawn chorus on the title, more birds as the lagoon recovers, none in a storm. */
  private birdsNow(stats: ReturnType<typeof computeStats>): { level: number; gulls: number } {
    if (this.phase === 'title') return { level: 0.55, gulls: 0.35 };
    if (this.phase === 'intro') return { level: this.introBirds, gulls: 0.3 };
    if (this.phase === 'victory') return { level: 1, gulls: 0.4 };
    const tod = this.sim.getTimeOfDay(this.progress);
    if (tod === 'monsoon') return { level: 0, gulls: 0 };
    const eco = stats.ecoPercent / 100;
    let level = tod === 'dawn' ? 0.95 : tod === 'sunset' ? 0.1 + 0.4 * eco : 0.15 + 0.85 * eco;
    // the whole lagoon holds its breath while the dolphin is in trouble, and while the pirates come in
    if (this.rescue === 'film' || this.pirates) level *= 0.25;
    if (this.phase === 'upgrade') level *= 0.6;
    return { level, gulls: tod === 'sunset' ? 0.2 : 0.45 };
  }

  private openShop(tab?: ShopTab): void {
    this.sim.drag.active = false;
    this.sim.drag.pointerId = -1;
    this.audio.setWaveCharge(0);
    this.audio.setShopDuck(true);
    this.phase = 'upgrade';
    this.audio.playUiOpen();
    const stats = computeStats(this.progress);
    this.ui.renderUpgradeScreen(this.progress, stats, this.sim.story.headline(), tab);
    this.ui.showPhase('upgrade');
  }

  private closeShop(): void {
    if (this.ui.sawWorkshopTools && this.sim.story.leaveWorkshop()) this.save();
    this.audio.setShopDuck(false);
    this.audio.playUiClose();
    this.phase = 'playing';
    this.ui.showPhase('playing');
  }

  private handleVictory(): void {
    this.save();
    this.phase = 'victory';
    this.audio.playVictory();
    this.ui.renderVictory(this.progress);
    this.ui.showPhase('victory');
    this.audio.setShopDuck(false);
    this.audio.setWaveCharge(0);
    this.audio.setWeather('dawn', false);
  }

  private buyUpgrade(id: UpgradeId, originEl?: HTMLElement | null): void {
    const lv = this.progress.upgrades[id] ?? 0;
    const cost = getUpgradeCost(id, lv);
    if (!isForSale(id, this.progress) || this.progress.coins < cost) {
      this.audio.playUiError();
      return;
    }

    this.progress.coins -= cost;
    this.progress.upgrades[id] = lv + 1;
    this.save();

    this.audio.playUpgradeBuy();
    const stats = computeStats(this.progress);
    this.sim.onUpgradePurchased(id, stats);
    this.ui.celebrate(`${UPGRADE_MAP[id].name} Lv ${lv + 1}!`, 'green', originEl);
    this.ui.renderUpgradeScreen(this.progress, stats, this.sim.story.headline());
  }

  private bindInputs(): void {
    window.addEventListener('resize', () => {
      this.renderer.resize();
      const state = this.renderer.getQualityState?.();
      if (state) this.ui.updateQualityUI(state);
    });

    // the opening pauses with the tab, and so should its boat's engine
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.audio.setMotor(0);
        this.audio.setWaveCharge(0);
        this.saveOnLeave();
      }
    });
    window.addEventListener('pagehide', () => this.saveOnLeave());
    window.addEventListener('beforeunload', (e) => {
      this.saveOnLeave();
      // nothing would be kept: let the player decide before it is gone
      if (this.saveFailed && this.phase !== 'title') {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    window.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]')) return;
      // during a film the only keys that do anything are skip and mute
      if (this.phase === 'intro' || this.ending || this.pirates || this.rescue === 'film' || this.rescue === 'free') {
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
        if (this.ui.isConfirmOpen()) {
          e.preventDefault();
          this.audio.playUiClick();
          this.ui.closeConfirm();
          return;
        }
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
          if (this.ui.isCreditsOpen() || this.ui.isConfirmOpen()) return;
          e.preventDefault();
          this.audio.playUiClick();
          if (this.ui.isSettingsOpen()) this.ui.closeSettings();
          else this.ui.openSettings();
          return;
        }
      }
      if (this.ui.isSettingsOpen() || this.ui.isConfirmOpen()) return;

      if (e.key === 'm' || e.key === 'M') {
        const muted = this.audio.toggleMute();
        this.ui.setMutedVisual(muted);
      } else if (e.key === 'Tab' || e.key === 'e' || e.key === 'E') {
        if (e.repeat) return;
        if (this.phase === 'playing') {
          if (e.key === 'Tab' && !this.progress.shopUnlocked) return;
          e.preventDefault();
          if (this.progress.shopUnlocked) this.openShop();
          else this.ui.explainClosedShop();
        } else if (this.phase === 'upgrade' && e.key !== 'Tab') {
          e.preventDefault();
          this.closeShop();
        }
      } else if (this.phase === 'upgrade') {
        if (e.key === '1') this.ui.setShopTab('tree');
        else if (e.key === '2') this.ui.setShopTab('journal');
        else if (this.ui.handleShopKey(e)) e.preventDefault();
      }
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (this.phase !== 'playing' || this.ui.isSettingsOpen() || this.ending || this.pirates) return;
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

      if (this.phase === 'playing' && !this.ui.isSettingsOpen() && !this.ending) {
        const stats = computeStats(this.progress);
        this.sim.launchPlayerWave(startX, startY, pos.x, pos.y, charge, this.progress, stats);
      }
    };

    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', (e) => {
      if (e.pointerId !== this.sim.drag.pointerId) return;
      this.sim.drag.active = false;
      this.sim.drag.pointerId = -1;
      this.audio.setWaveCharge(0);
    });
  }

  /** The page is going away: keep the story as it is, unless there is none yet. */
  private saveOnLeave(): void {
    if (this.phase === 'title' && !this.sim.lagoonInitialized) return;
    if (this.sim.lagoonInitialized && this.sim.progress === this.progress) this.save();
  }

  /** Project the guide with the same camera pose that drew this frame. */
  private updateGuides(objective: Objective | null): void {
    let hint = null;
    let target = null;
    if (objective && !this.sim.drag.active && this.renderer.worldToScreen &&
        (this.rescue === null || this.rescue === 'help')) {
      if (objective.at) target = this.renderer.worldToScreen(objective.at.x, objective.at.y);
      if (objective.swipe) {
        const a = this.renderer.worldToScreen(objective.swipe.from.x, objective.swipe.from.y);
        const b = this.renderer.worldToScreen(objective.swipe.to.x, objective.swipe.to.y);
        if (a && b) hint = { ax: a.x, ay: a.y, bx: b.x, by: b.y };
      }
    }
    const visible = this.ui.updateSwipeHint(hint);
    this.ui.updatePointer(visible ? null : target);
  }

  private loop(now: number): void {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;
    if (this.landscape.paused) {
      requestAnimationFrame((t) => this.loop(t));
      return;
    }

    const stats = computeStats(this.progress);
    // a film the renderer has dropped (something else took the camera) is over here too
    if (this.pirates && this.renderer.piratesActive === false) this.finishPirates();
    const filming = this.ending || this.pirates || this.rescue === 'film' || this.rescue === 'free';
    const activePlay = this.phase === 'playing' && !this.ui.isSettingsOpen() && !this.ending;
    let guideObjective: Objective | null = null;

    if (activePlay) {
      this.sim.update(dt, this.progress, stats);
      if (!filming) {
        const obj = this.sim.story.objective();
        const boss = this.sim.getBossEntity();
        const bossRatio = boss ? boss.hp / boss.maxHp : null;
        this.ui.updateHud(
          this.progress,
          stats,
          this.sim.getTimeOfDay(this.progress),
          this.sim.energy,
          this.sim.maxEnergy,
          this.sim.comboCount,
          bossRatio,
          obj
        );
        guideObjective = obj;
      }

      this.autoSaveTimer += dt;
      if (this.autoSaveTimer >= 4) {
        this.autoSaveTimer = 0;
        this.save();
      }
    } else if (!document.hidden) {
      this.sim.updateAmbientOnly(dt, this.progress, stats);
      // under the opening the tourists' rubbish bobs where it fell; nothing is collected yet
      if (this.phase === 'intro') this.sim.bob(dt);
    }
    this.ui.tick(dt);
    if (!document.hidden) {
      const birds = this.birdsNow(stats);
      this.audio.updateBirds(dt, birds.level, birds.gulls);
    }

    this.renderer.setPhase?.(this.phase);
    this.renderer.render(this.sim, this.progress, stats, activePlay);
    this.updateGuides(guideObjective);
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
