import type {
  ComputedStats,
  GamePhase,
  PlayerProgress,
  ShopTab,
  TimeOfDay,
  UpgradeBranch,
  UpgradeId,
} from './types';
import {
  ACHIEVEMENT_DEFS,
  countClaimableAchievements,
  isAchievementClaimable,
} from './achievements';
import {
  countAffordableUpgrades,
  getMinUnlockableCost,
  getUpgradeCost,
  isUpgradeUnlocked,
  UPGRADE_DEFS,
  UPGRADE_MAP,
} from './upgrades';
import { getUiIconSvg, type UiIconName } from './ui-kit/icons';
import type { QualitySetting, Tier } from './scene/quality';
import type { QualityState } from './scene/SceneRenderer';
import {
  renderAchievementCard,
  renderSectionDivider,
  renderStatTile,
  renderUpgradeCard,
  showUiToast,
  spawnUiConfetti,
  type UiSwatch,
} from './ui-kit/templates';

const TIME_META: Record<TimeOfDay, { label: string; swatch: UiSwatch; icon: UiIconName }> = {
  morning: { label: 'PAGI CERAH', swatch: 'blue', icon: 'sun' },
  noon: { label: 'SIANG BERKILAU', swatch: 'blue', icon: 'sun' },
  sunset: { label: 'SENJA PESISIR', swatch: 'orange', icon: 'sunset' },
  monsoon: { label: 'BADAI MUSON', swatch: 'purple', icon: 'storm' },
  dawn: { label: 'FAJAR HARMONI', swatch: 'gold', icon: 'dawn' },
};

const BRANCH_LABELS: Record<UpgradeBranch, string> = {
  core: 'INTI A.L.U.N.',
  wave: 'CABANG OMBAK',
  energy: 'CABANG ENERGI',
  ai: 'MODUL AI A.L.U.N.',
  eco: 'MUATAN & EKOSISTEM',
  final: 'MISI KLIMAKS',
};

const BRANCH_SWATCH: Record<UpgradeBranch, UiSwatch> = {
  core: 'teal',
  wave: 'blue',
  energy: 'orange',
  ai: 'teal',
  eco: 'green',
  final: 'red',
};

const CARD_SECTIONS: { label: string; icon: UiIconName; ids: UpgradeId[] }[] = [
  {
    label: 'OMBAK & TENAGA PASANG',
    icon: 'wave',
    ids: ['wave_width', 'wave_power', 'tidal_charge', 'echo_wave', 'resonance_burst'],
  },
  {
    label: 'MUATAN, KELANGKAAN & ENERGI',
    icon: 'rarity',
    ids: ['net_expand', 'trash_density', 'trash_rarity', 'tidal_energy', 'energy_regen', 'combo_flow'],
  },
  {
    label: 'MODUL AI A.L.U.N.',
    icon: 'sonar',
    ids: ['ai_guide', 'ai_sonar', 'ai_buoy'],
  },
  {
    label: 'EKOSISTEM TROPIS & MISI FINAL',
    icon: 'mangrove',
    ids: ['unlock_mangrove', 'unlock_boats', 'unlock_forest', 'unlock_boss'],
  },
];

const TIER_LABELS: Record<Tier, string> = {
  low: 'Rendah',
  medium: 'Sedang',
  high: 'Tinggi',
  ultra: 'Ultra',
};

export interface UIHandlers {
  onStartNew: () => void;
  onContinue: () => void;
  onOpenShop: (tab?: ShopTab) => void;
  onCloseShop: () => void;
  onBuyUpgrade: (id: UpgradeId, originEl?: HTMLElement | null) => void;
  onClaimAchievement: (id: string, originEl?: HTMLElement | null) => void;
  onToggleMute: () => void;
  onResetSave: () => void;
  onStartEndless: () => void;
  onOpenShopFromVictory: () => void;
  onSelectQuality: (setting: QualitySetting) => void;
  onSettingsToggle?: (open: boolean) => void;
  onTabSwitch?: () => void;
  onUiClick?: () => void;
  onUiError?: () => void;
}

export class GameUI {
  private hud = document.getElementById('hud')!;
  private titleScreen = document.getElementById('title-screen')!;
  private upgradeScreen = document.getElementById('upgrade-screen')!;
  private victoryScreen = document.getElementById('victory-screen')!;
  private creditsModal = document.getElementById('credits-modal')!;
  private settingsModal = document.getElementById('settings-modal')!;
  private settingsActiveChip = document.getElementById('settings-active-chip')!;
  private settingsResChip = document.getElementById('settings-res-chip')!;
  private graphicsOptions = document.getElementById('graphics-options')!;
  private webglErrorModal = document.getElementById('webgl-error-modal')!;
  private webglErrorTitle = document.getElementById('webgl-error-title')!;
  private webglErrorMsg = document.getElementById('webgl-error-msg')!;
  private webglErrorTip = document.getElementById('webgl-error-tip')!;
  private btnWebglRetry = document.getElementById('btn-webgl-retry') as HTMLButtonElement;
  private settingsOpen = false;
  private settingsReturnFocus: HTMLElement | null = null;

  private hudCoinPill = document.getElementById('hud-coin-pill')!;
  private hudCoins = document.getElementById('hud-coins')!;
  private hudCoinDeltas = document.getElementById('hud-coin-deltas')!;
  private hudComboPill = document.getElementById('hud-combo-pill')!;
  private hudComboVal = document.getElementById('hud-combo-val')!;
  private hudEnergyVal = document.getElementById('hud-energy-val')!;
  private hudEnergyBar = document.getElementById('hud-energy-bar')!;
  private hudTimePill = document.getElementById('hud-time-pill')!;
  private hudTimeIcon = document.getElementById('hud-time-icon')!;
  private hudDayLabel = document.getElementById('hud-day-label')!;
  private hudEcoBar = document.getElementById('hud-eco-bar')!;
  private hudEcoPct = document.getElementById('hud-eco-pct')!;
  private hudBossPill = document.getElementById('hud-boss-pill')!;
  private hudBossBar = document.getElementById('hud-boss-bar')!;
  private hudBossVal = document.getElementById('hud-boss-val')!;

  private btnMute = document.getElementById('btn-mute') as HTMLButtonElement;
  private btnOpenShop = document.getElementById('btn-open-shop') as HTMLButtonElement;
  private shopBtnIcon = document.getElementById('shop-btn-icon')!;
  private shopBtnLabel = document.getElementById('shop-btn-label')!;
  private shopBadge = document.getElementById('shop-badge')!;
  private btnOpenAchieve = document.getElementById('btn-open-achieve') as HTMLButtonElement;
  private achieveBadge = document.getElementById('achieve-badge')!;

  private hudObjective = document.getElementById('hud-objective')!;
  private hudObjIcon = document.getElementById('hud-obj-icon')!;
  private hudObjTitle = document.getElementById('hud-obj-title')!;
  private hudObjSub = document.getElementById('hud-obj-sub')!;

  private radioToast = document.getElementById('radio-toast')!;
  private radioSender = document.getElementById('radio-sender')!;
  private radioText = document.getElementById('radio-text')!;

  private btnContinue = document.getElementById('btn-continue')!;
  private shopRibbon = document.getElementById('shop-ribbon')!;
  private shopRibbonTitle = document.getElementById('shop-ribbon-title')!;
  private tabCards = document.getElementById('tab-cards') as HTMLButtonElement;
  private tabTree = document.getElementById('tab-tree') as HTMLButtonElement;
  private tabAchievements = document.getElementById('tab-achievements') as HTMLButtonElement;
  private tabBadgeCards = document.getElementById('tab-badge-cards')!;
  private tabBadgeAchieve = document.getElementById('tab-badge-achieve')!;
  private panelCards = document.getElementById('panel-cards')!;
  private panelTree = document.getElementById('panel-tree')!;
  private panelAchievements = document.getElementById('panel-achievements')!;

  private cardsScroll = document.getElementById('cards-scroll')!;
  private runSummaryChips = document.getElementById('run-summary-chips')!;
  private upgradeCoins = document.getElementById('upgrade-coins')!;
  private treeLinks = document.getElementById('tree-links')!;
  private treeNodes = document.getElementById('tree-nodes')!;

  private inspHeaderCard = document.getElementById('insp-header-card')!;
  private inspBranch = document.getElementById('insp-branch')!;
  private inspIcon = document.getElementById('insp-icon')!;
  private inspTitle = document.getElementById('insp-title')!;
  private inspDesc = document.getElementById('insp-desc')!;
  private inspStats = document.getElementById('insp-stats')!;
  private btnBuyNode = document.getElementById('btn-buy-node') as HTMLButtonElement;
  private inspEcoVal = document.getElementById('insp-eco-val')!;
  private inspEcoBar = document.getElementById('insp-eco-bar')!;
  private inspEcoSub = document.getElementById('insp-eco-sub')!;

  private achChap1Btn = document.getElementById('ach-chap-1') as HTMLButtonElement;
  private achChap2Btn = document.getElementById('ach-chap-2') as HTMLButtonElement;
  private achBadge1 = document.getElementById('ach-badge-1')!;
  private achBadge2 = document.getElementById('ach-badge-2')!;
  private achCountLabel = document.getElementById('ach-count-label')!;
  private achOverallBar = document.getElementById('ach-overall-bar')!;
  private achCoinsLabel = document.getElementById('ach-coins-label')!;
  private achieveGrid = document.getElementById('achieve-grid')!;

  private victoryStats = document.getElementById('victory-stats')!;

  private activeTab: ShopTab = 'cards';
  private activeAchChapter: 1 | 2 = 1;
  private selectedNode: UpgradeId = 'wave_width';
  private radioTimeout: number | null = null;
  private lastKnownCoins = -1;
  private displayedCoins = 0;
  private lastHudCoinsText = '';
  private lastComboShown: boolean | null = null;
  private lastComboText = '';
  private lastEnergyText = '';
  private lastEnergyWidth = '';
  private lastEnergySwatch = '';
  private lastEcoPct = -1;
  private lastEcoMangroves = -1;
  private lastBossShown: boolean | null = null;
  private lastBossPct = -1;
  private lastShopSig = '';
  private lastTimeKey: TimeOfDay | null = null;
  private lastObjectiveKey = '';
  private objectiveDismissedKey = '';
  private lastShopUnlockedState: boolean | null = null;
  private currentProgress: PlayerProgress | null = null;
  private currentStats: ComputedStats | null = null;
  private handlers: UIHandlers;

  constructor(handlers: UIHandlers) {
    this.handlers = handlers;
    this.mountStaticIcons();
    this.bindStaticEvents();
  }

  private mountStaticIcons(): void {
    document.getElementById('hud-coin-icon')!.innerHTML = getUiIconSvg('coin');
    document.getElementById('shop-coin-icon')!.innerHTML = getUiIconSvg('coin');
    document.getElementById('hud-energy-icon')!.innerHTML = getUiIconSvg('wave');
    document.getElementById('hud-eco-icon')!.innerHTML = getUiIconSvg('mangrove');
    document.getElementById('hud-boss-icon')!.innerHTML = getUiIconSvg('boss');
    document.getElementById('achieve-btn-icon')!.innerHTML = getUiIconSvg('trophy');
    document.getElementById('title-emblem')!.innerHTML = getUiIconSvg('wave');
    document.getElementById('tf-icon-1')!.innerHTML = getUiIconSvg('swipe');
    document.getElementById('tf-icon-2')!.innerHTML = getUiIconSvg('shop');
    document.getElementById('title-play-icon')!.innerHTML = getUiIconSvg('play');
    document.getElementById('title-settings-icon')!.innerHTML = getUiIconSvg('settings');
    document.getElementById('btn-hud-settings')!.innerHTML = getUiIconSvg('settings');
    document.getElementById('title-info-icon')!.innerHTML = getUiIconSvg('info');
    document.getElementById('tab-icon-cards')!.innerHTML = getUiIconSvg('shop');
    document.getElementById('tab-icon-tree')!.innerHTML = getUiIconSvg('tree');
    document.getElementById('tab-icon-achieve')!.innerHTML = getUiIconSvg('trophy');
    document.getElementById('ach-trophy-icon')!.innerHTML = getUiIconSvg('trophy');
    document.getElementById('ach-coin-icon')!.innerHTML = getUiIconSvg('coin');
    document.getElementById('footer-play-icon')!.innerHTML = getUiIconSvg('play');
    document.getElementById('btn-close-shop')!.innerHTML = getUiIconSvg('close');
    document.getElementById('btn-close-credits')!.innerHTML = getUiIconSvg('close');
    document.getElementById('btn-close-settings')!.innerHTML = getUiIconSvg('close');
    this.setMutedVisual(false);
  }

  private bindStaticEvents(): void {
    document.getElementById('btn-play')!.addEventListener('click', () => {
      this.handlers.onUiClick?.();
      this.handlers.onStartNew();
    });
    this.btnContinue.addEventListener('click', () => {
      this.handlers.onUiClick?.();
      this.handlers.onContinue();
    });
    this.btnOpenShop.addEventListener('click', () => {
      if (!this.btnOpenShop.disabled) {
        this.handlers.onOpenShop('cards');
      } else {
        this.handlers.onUiError?.();
        showUiToast('Kumpulkan 20 Koin dulu untuk membuka Kalibrasi!', 'red');
      }
    });
    this.btnOpenAchieve.addEventListener('click', () => {
      this.handlers.onOpenShop('achievements');
    });
    document.getElementById('btn-keycap-shop')!.addEventListener('click', () => {
      if (!this.btnOpenShop.disabled) {
        this.handlers.onOpenShop();
      } else {
        this.handlers.onUiError?.();
        showUiToast('Kumpulkan 20 Koin dulu untuk membuka Kalibrasi!', 'red');
      }
    });
    document.getElementById('btn-keycap-mute')!.addEventListener('click', () => {
      this.handlers.onToggleMute();
    });
    const openSettingsFrom = (el: HTMLElement | null) => {
      this.handlers.onUiClick?.();
      this.openSettings(el);
    };
    document.getElementById('btn-title-settings')!.addEventListener('click', (e) => {
      openSettingsFrom(e.currentTarget as HTMLElement);
    });
    document.getElementById('btn-hud-settings')!.addEventListener('click', (e) => {
      openSettingsFrom(e.currentTarget as HTMLElement);
    });
    document.getElementById('btn-keycap-settings')!.addEventListener('click', (e) => {
      openSettingsFrom(e.currentTarget as HTMLElement);
    });
    document.getElementById('btn-close-settings')!.addEventListener('click', () => {
      this.handlers.onUiClick?.();
      this.closeSettings();
    });
    document.getElementById('btn-close-settings-ok')!.addEventListener('click', () => {
      this.handlers.onUiClick?.();
      this.closeSettings();
    });
    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) {
        this.handlers.onUiClick?.();
        this.closeSettings();
      }
    });
    this.graphicsOptions.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-quality]');
      if (!btn) return;
      const q = btn.dataset.quality as QualitySetting;
      this.handlers.onTabSwitch?.();
      this.handlers.onSelectQuality(q);
    });
    this.graphicsOptions.addEventListener('keydown', (e) => {
      const btns = Array.from(this.graphicsOptions.querySelectorAll<HTMLButtonElement>('[data-quality]'));
      const cur = btns.indexOf(document.activeElement as HTMLButtonElement);
      if (cur < 0) return;
      let next = -1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (cur + 1) % btns.length;
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (cur - 1 + btns.length) % btns.length;
      if (next >= 0) {
        e.preventDefault();
        btns[next].focus();
        const q = btns[next].dataset.quality as QualitySetting;
        this.handlers.onTabSwitch?.();
        this.handlers.onSelectQuality(q);
      }
    });
    this.btnWebglRetry.addEventListener('click', () => {
      location.reload();
    });
    this.hudObjective.addEventListener('click', () => {
      this.objectiveDismissedKey = this.lastObjectiveKey;
      this.hudObjective.classList.add('hidden');
      this.handlers.onUiClick?.();
    });

    document.getElementById('btn-close-shop')!.addEventListener('click', () => {
      this.handlers.onCloseShop();
    });
    document.getElementById('btn-resume-lagoon')!.addEventListener('click', () => {
      this.handlers.onCloseShop();
    });
    this.upgradeScreen.addEventListener('click', (e) => {
      if (e.target === this.upgradeScreen) {
        this.handlers.onCloseShop();
      }
    });

    this.tabCards.addEventListener('click', () => this.setShopTab('cards'));
    this.tabTree.addEventListener('click', () => this.setShopTab('tree'));
    this.tabAchievements.addEventListener('click', () => this.setShopTab('achievements'));

    this.achChap1Btn.addEventListener('click', () => {
      if (this.activeAchChapter !== 1) {
        this.activeAchChapter = 1;
        this.handlers.onTabSwitch?.();
        if (this.currentProgress) this.renderAchievementsPanel(this.currentProgress);
      }
    });
    this.achChap2Btn.addEventListener('click', () => {
      if (this.activeAchChapter !== 2) {
        this.activeAchChapter = 2;
        this.handlers.onTabSwitch?.();
        if (this.currentProgress) this.renderAchievementsPanel(this.currentProgress);
      }
    });

    // Event delegation for Cards grid buy buttons
    this.cardsScroll.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-buy-id]');
      if (!btn) return;
      const id = btn.dataset.buyId as UpgradeId;
      if (btn.disabled) {
        this.handlers.onUiError?.();
        showUiToast('Koin belum cukup atau syarat belum terbuka!', 'red', 1800);
        return;
      }
      this.selectedNode = id;
      this.handlers.onBuyUpgrade(id, btn);
    });

    // Event delegation for Achievements claim buttons
    this.achieveGrid.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-claim-id]');
      if (!btn) return;
      const id = btn.dataset.claimId!;
      if (btn.disabled) {
        this.handlers.onUiError?.();
        showUiToast('Target pencapaian belum selesai!', 'red', 1600);
        return;
      }
      this.handlers.onClaimAchievement(id, btn);
    });

    this.btnMute.addEventListener('click', () => {
      this.handlers.onToggleMute();
    });
    document.getElementById('btn-reset-save')!.addEventListener('click', () => {
      this.handlers.onUiClick?.();
      if (window.confirm('Reset semua progres ALUN dan mulai ulang dari awal?')) {
        this.lastKnownCoins = -1;
        this.displayedCoins = 0;
        this.objectiveDismissedKey = '';
        this.handlers.onResetSave();
      }
    });

    document.getElementById('btn-credits')!.addEventListener('click', () => {
      this.handlers.onUiClick?.();
      this.creditsModal.classList.remove('hidden');
    });
    const closeCredits = () => {
      this.handlers.onUiClick?.();
      this.creditsModal.classList.add('hidden');
    };
    document.getElementById('btn-close-credits')!.addEventListener('click', closeCredits);
    document.getElementById('btn-close-credits-ok')!.addEventListener('click', closeCredits);
    this.creditsModal.addEventListener('click', (e) => {
      if (e.target === this.creditsModal) closeCredits();
    });

    document.getElementById('btn-endless')!.addEventListener('click', () => {
      this.handlers.onUiClick?.();
      this.handlers.onStartEndless();
    });
    document.getElementById('btn-victory-tree')!.addEventListener('click', () => {
      this.handlers.onUiClick?.();
      this.handlers.onOpenShopFromVictory();
    });
    this.btnBuyNode.addEventListener('click', () => {
      if (this.btnBuyNode.disabled) {
        this.handlers.onUiError?.();
        return;
      }
      this.handlers.onBuyUpgrade(this.selectedNode, this.btnBuyNode);
    });
  }

  public setMutedVisual(muted: boolean): void {
    this.btnMute.innerHTML = getUiIconSvg(muted ? 'sound_off' : 'sound_on');
    this.btnMute.dataset.swatch = muted ? 'red' : 'dark';
  }

  public setShopTab(tab: ShopTab, silent = false): void {
    if (this.activeTab === tab && !silent) return;
    this.activeTab = tab;
    if (!silent) this.handlers.onTabSwitch?.();
    this.applyShopTabVisuals();
    if (this.currentProgress && this.currentStats) {
      if (tab === 'cards') this.renderCardsPanel(this.currentProgress);
      else if (tab === 'tree') {
        this.renderSkillTree(this.currentProgress, this.currentStats);
        this.renderInspector(this.currentProgress, this.currentStats);
      } else if (tab === 'achievements') {
        this.renderAchievementsPanel(this.currentProgress);
      }
    }
  }

  private applyShopTabVisuals(): void {
    const isCards = this.activeTab === 'cards';
    const isTree = this.activeTab === 'tree';
    const isAch = this.activeTab === 'achievements';

    this.panelCards.classList.toggle('hidden', !isCards);
    this.panelTree.classList.toggle('hidden', !isTree);
    this.panelAchievements.classList.toggle('hidden', !isAch);

    this.tabCards.classList.toggle('is-active', isCards);
    this.tabTree.classList.toggle('is-active', isTree);
    this.tabAchievements.classList.toggle('is-active', isAch);

    this.tabCards.dataset.swatch = isCards ? 'purple' : 'slate';
    this.tabTree.dataset.swatch = isTree ? 'teal' : 'slate';
    this.tabAchievements.dataset.swatch = isAch ? 'blue' : 'slate';

    if (isCards) {
      this.shopRibbon.dataset.swatch = 'orange';
      this.shopRibbonTitle.textContent = 'Toko Kalibrasi A.L.U.N.';
    } else if (isTree) {
      this.shopRibbon.dataset.swatch = 'teal';
      this.shopRibbonTitle.textContent = 'Pohon Evolusi Ombak';
    } else {
      this.shopRibbon.dataset.swatch = 'blue';
      this.shopRibbonTitle.textContent = 'Pencapaian Pesisir';
    }
  }

  public isSettingsOpen(): boolean {
    return this.settingsOpen;
  }

  public isCreditsOpen(): boolean {
    return !this.creditsModal.classList.contains('hidden');
  }

  public closeCredits(): void {
    this.creditsModal.classList.add('hidden');
  }

  public openSettings(returnFocus?: HTMLElement | null): void {
    if (this.settingsOpen) return;
    this.settingsOpen = true;
    this.settingsReturnFocus = returnFocus ?? (document.activeElement as HTMLElement | null);
    this.settingsModal.classList.remove('hidden');
    this.handlers.onSettingsToggle?.(true);
    const active = this.graphicsOptions.querySelector<HTMLButtonElement>('.graphics-opt.is-selected') ??
      this.graphicsOptions.querySelector<HTMLButtonElement>('[data-quality]');
    active?.focus();
  }

  public closeSettings(): void {
    if (!this.settingsOpen) return;
    this.settingsOpen = false;
    this.settingsModal.classList.add('hidden');
    this.handlers.onSettingsToggle?.(false);
    this.settingsReturnFocus?.focus();
    this.settingsReturnFocus = null;
  }

  public updateQualityUI(state: QualityState): void {
    const btns = this.graphicsOptions.querySelectorAll<HTMLButtonElement>('[data-quality]');
    for (const btn of btns) {
      const sel = btn.dataset.quality === state.setting;
      btn.classList.toggle('is-selected', sel);
      btn.setAttribute('aria-checked', sel ? 'true' : 'false');
    }
    const tierName = TIER_LABELS[state.tier];
    this.settingsActiveChip.textContent =
      state.setting === 'auto' ? `Aktif: ${tierName} (Otomatis)` : `Aktif: ${tierName}`;
    this.settingsResChip.textContent = `${state.width}×${state.height}`;
  }

  public showPerfHint(suggested: Tier): void {
    const label = TIER_LABELS[suggested];
    showUiToast(`Performa terasa berat — coba grafis ${label} di Pengaturan [G]`, 'orange', 4200);
  }

  public showWebglError(title: string, message: string, tip: string, showRetry = true): void {
    this.webglErrorTitle.textContent = title;
    this.webglErrorMsg.textContent = message;
    this.webglErrorTip.textContent = tip;
    this.btnWebglRetry.classList.toggle('hidden', !showRetry);
    this.webglErrorModal.classList.remove('hidden');
  }

  public hideWebglError(): void {
    this.webglErrorModal.classList.add('hidden');
  }

  public showPhase(phase: GamePhase, hasSavedProgress: boolean): void {
    this.titleScreen.classList.toggle('hidden', phase !== 'title');
    this.hud.classList.toggle('hidden', phase !== 'playing');
    this.upgradeScreen.classList.toggle('hidden', phase !== 'upgrade');
    this.victoryScreen.classList.toggle('hidden', phase !== 'victory');
    this.btnContinue.classList.toggle('hidden', !hasSavedProgress);
  }

  public showRadio(sender: string, text: string): void {
    this.radioSender.textContent = sender;
    this.radioText.textContent = text;
    this.radioToast.classList.remove('hidden');
    if (this.radioTimeout !== null) window.clearTimeout(this.radioTimeout);
    this.radioTimeout = window.setTimeout(() => {
      this.radioToast.classList.add('hidden');
    }, 5200);
  }

  public celebrate(text: string, swatch: UiSwatch = 'green', originEl?: HTMLElement | null): void {
    showUiToast(text, swatch, 2400);
    spawnUiConfetti(originEl ?? null, 24);
  }

  public showToast(text: string, swatch: UiSwatch = 'green'): void {
    showUiToast(text, swatch, 2200);
  }

  private spawnCoinDelta(amount: number): void {
    const el = document.createElement('span');
    el.className = 'ui-delta-float t-stroke-sm t-lime num';
    el.textContent = `+${amount.toLocaleString('id-ID')}`;
    this.hudCoinDeltas.appendChild(el);
    window.setTimeout(() => el.remove(), 1100);

    this.hudCoinPill.classList.remove('is-bump');
    requestAnimationFrame(() => this.hudCoinPill.classList.add('is-bump'));
    window.setTimeout(() => this.hudCoinPill.classList.remove('is-bump'), 190);
  }

  public updateHud(
    progress: PlayerProgress,
    stats: ComputedStats,
    tod: TimeOfDay,
    energy: number,
    maxEnergy: number,
    comboMult: number,
    comboCount: number,
    bossHpRatio: number | null
  ): void {
    const exactCoins = Math.floor(progress.coins);
    if (this.lastKnownCoins < 0) {
      this.lastKnownCoins = exactCoins;
      this.displayedCoins = exactCoins;
    } else if (exactCoins > this.lastKnownCoins) {
      const gained = exactCoins - this.lastKnownCoins;
      if (gained >= 1) this.spawnCoinDelta(gained);
      this.lastKnownCoins = exactCoins;
    } else if (exactCoins < this.lastKnownCoins) {
      this.lastKnownCoins = exactCoins;
      this.displayedCoins = exactCoins;
    }

    // Smooth rolling counter interpolation
    if (this.displayedCoins !== exactCoins) {
      const diff = exactCoins - this.displayedCoins;
      const step = Math.abs(diff) <= 2 ? diff : Math.ceil(diff * 0.22);
      this.displayedCoins += step;
    }
    const coinsText = Math.floor(this.displayedCoins).toLocaleString('id-ID');
    if (coinsText !== this.lastHudCoinsText) {
      this.lastHudCoinsText = coinsText;
      this.hudCoins.textContent = coinsText;
    }

    // Time of Day sky pill
    if (this.lastTimeKey !== tod) {
      this.lastTimeKey = tod;
      const meta = TIME_META[tod];
      this.hudTimePill.dataset.swatch = meta.swatch;
      this.hudTimeIcon.innerHTML = getUiIconSvg(meta.icon);
      this.hudDayLabel.textContent = meta.label;
    }

    // Combo chip
    const showCombo = comboCount >= 2;
    if (showCombo !== this.lastComboShown) {
      this.lastComboShown = showCombo;
      this.hudComboPill.classList.toggle('hidden', !showCombo);
    }
    if (showCombo) {
      const comboText = `x${comboMult.toFixed(2)}`;
      if (comboText !== this.lastComboText) {
        this.lastComboText = comboText;
        this.hudComboVal.textContent = comboText;
      }
    }

    // Energy meter pill (compositor-only transform avoids per-frame layout/paint during wave regeneration)
    const energyText = `${Math.round(energy)}/${Math.round(maxEnergy)}`;
    if (energyText !== this.lastEnergyText) {
      this.lastEnergyText = energyText;
      this.hudEnergyVal.textContent = energyText;
    }
    const energyPct = Math.max(0, Math.min(100, (energy / Math.max(1, maxEnergy)) * 100));
    const energyStep = Math.round(energyPct * 2) * 0.5;
    const energyTransform = `translateX(${(energyStep - 100).toFixed(1)}%)`;
    if (energyTransform !== this.lastEnergyWidth) {
      this.lastEnergyWidth = energyTransform;
      this.hudEnergyBar.style.transform = energyTransform;
    }
    const energySwatch = energyPct < 22 ? 'red' : 'orange';
    if (energySwatch !== this.lastEnergySwatch) {
      this.lastEnergySwatch = energySwatch;
      this.hudEnergyBar.dataset.swatch = energySwatch;
    }

    // Eco slim bar
    if (stats.ecoPercent !== this.lastEcoPct || progress.mangroves.length !== this.lastEcoMangroves) {
      this.lastEcoPct = stats.ecoPercent;
      this.lastEcoMangroves = progress.mangroves.length;
      this.hudEcoBar.style.width = `${stats.ecoPercent}%`;
      this.hudEcoPct.textContent = `${stats.ecoPercent}% · ${progress.mangroves.length} Pohon`;
    }

    // Boss slim bar
    const showBoss = bossHpRatio !== null;
    if (showBoss !== this.lastBossShown) {
      this.lastBossShown = showBoss;
      this.hudBossPill.classList.toggle('hidden', !showBoss);
    }
    if (showBoss) {
      const pct = Math.max(0, Math.min(100, Math.round(bossHpRatio * 100)));
      if (pct !== this.lastBossPct) {
        this.lastBossPct = pct;
        this.hudBossVal.textContent = `KAPAL ${pct}%`;
        this.hudBossBar.style.width = `${pct}%`;
      }
    }

    // Shop / Kalibrasi Button (Locked until first affordable upgrade!)
    const shopSig = `${progress.shopUnlocked ? 1 : 0}:${exactCoins}:${progress.totalWaves}:${progress.totalTrash}:${progress.totalRareTrash}:${progress.totalBoats}:${progress.totalFires}:${progress.totalResonances}:${progress.mangroves.length}:${progress.claimedAchievements.length}:${stats.ecoPercent}:${progress.victoryAchieved ? 1 : 0}`;
    if (shopSig !== this.lastShopSig) {
      this.lastShopSig = shopSig;
      const claimableAch = countClaimableAchievements(progress);
      if (!progress.shopUnlocked) {
        const target = getMinUnlockableCost(progress);
        this.btnOpenShop.disabled = true;
        this.btnOpenShop.dataset.swatch = 'slate';
        this.btnOpenShop.classList.remove('has-affordable');
        if (this.lastShopUnlockedState !== false) {
          this.lastShopUnlockedState = false;
          this.shopBtnIcon.innerHTML = getUiIconSvg('lock');
        }
        this.shopBadge.classList.add('hidden');
        this.shopBtnLabel.textContent = `KALIBRASI · ${exactCoins}/${target}`;
        this.btnOpenAchieve.classList.add('hidden');
      } else {
        const affordable = countAffordableUpgrades(progress);
        this.btnOpenShop.disabled = false;
        this.btnOpenShop.dataset.swatch = affordable > 0 ? 'gold' : 'purple';
        this.btnOpenShop.classList.toggle('has-affordable', affordable > 0);
        if (this.lastShopUnlockedState !== true) {
          this.lastShopUnlockedState = true;
          this.shopBtnIcon.innerHTML = getUiIconSvg('shop');
        }
        this.shopBtnLabel.textContent = 'KALIBRASI';
        this.shopBadge.classList.toggle('hidden', affordable === 0);
        if (affordable > 0) this.shopBadge.textContent = String(affordable);

        this.btnOpenAchieve.classList.remove('hidden');
        this.achieveBadge.classList.toggle('hidden', claimableAch === 0);
        if (claimableAch > 0) this.achieveBadge.textContent = String(claimableAch);
      }
    }

    // Dynamic Objective Banner (Exact f_031 Objective Card, auto-hides when dismissed)
    this.updateObjectiveBanner(progress, stats, showBoss);
  }

  private updateObjectiveBanner(
    progress: PlayerProgress,
    stats: ComputedStats,
    bossActive: boolean
  ): void {
    let key = '';
    let icon: UiIconName = 'wave';
    let title = '';
    let sub = '';
    let swatch: UiSwatch = 'orange';

    if (!progress.shopUnlocked) {
      key = 'unlock_shop';
      icon = 'coin';
      title = 'Kumpulkan 20 Koin';
      sub = 'Klik & geser di air untuk menyapu limbah ke Jaring Desa!';
      swatch = 'orange';
    } else if (bossActive) {
      key = 'defeat_boss';
      icon = 'boss';
      title = 'Usir Kapal Limbah!';
      sub = 'Hantam dengan Ombak Pasang & Resonansi untuk pulihkan laguna!';
      swatch = 'red';
    } else if (progress.totalWaves < 14 && Object.values(progress.upgrades).reduce((a, b) => a + b, 0) <= 1) {
      key = 'first_upgrade';
      icon = 'shop';
      title = 'Buka Kalibrasi [Tab]';
      sub = 'Tingkatkan Bentang Ombak, Debit Muatan, & AI Arus Pemandu!';
      swatch = 'gold';
    } else if (!progress.victoryAchieved && stats.bossUnlocked) {
      key = 'storm_active';
      icon = 'storm';
      title = 'Badai Muson Tiba';
      sub = 'Siapkan ombak terbesar menghadapi Kapal Limbah Ilegal!';
      swatch = 'purple';
    } else {
      key = '';
    }

    if (!key || key === this.objectiveDismissedKey) {
      this.hudObjective.classList.add('hidden');
      return;
    }

    if (key !== this.lastObjectiveKey) {
      this.lastObjectiveKey = key;
      this.hudObjective.dataset.swatch = swatch;
      this.hudObjIcon.innerHTML = getUiIconSvg(icon);
      this.hudObjTitle.textContent = title;
      this.hudObjSub.textContent = sub;
    }
    this.hudObjective.classList.remove('hidden');
  }

  public renderUpgradeScreen(progress: PlayerProgress, stats: ComputedStats, forceTab?: ShopTab): void {
    this.currentProgress = progress;
    this.currentStats = stats;

    if (forceTab) {
      this.activeTab = forceTab;
    }
    this.applyShopTabVisuals();

    this.upgradeCoins.textContent = Math.floor(progress.coins).toLocaleString('id-ID');

    const chips: string[] = [
      `<span class="shop-chip t-stroke-xs">Muatan: ${stats.maxTrashCount}</span>`,
      `<span class="shop-chip chip-gold t-stroke-xs">Nilai x${stats.coinMultiplier.toFixed(2)}</span>`,
      `<span class="shop-chip chip-eco t-stroke-xs">${progress.mangroves.length} Mangrove</span>`,
    ];
    if (stats.aiGuideStrength > 0) {
      chips.push(`<span class="shop-chip chip-ai t-stroke-xs">AI Aktif</span>`);
    }
    this.runSummaryChips.innerHTML = chips.join('');

    // Notification badges on modal tabs
    const affordableCount = countAffordableUpgrades(progress);
    this.tabBadgeCards.classList.toggle('hidden', affordableCount === 0);
    if (affordableCount > 0) this.tabBadgeCards.textContent = String(affordableCount);

    const claimableCount = countClaimableAchievements(progress);
    this.tabBadgeAchieve.classList.toggle('hidden', claimableCount === 0);
    if (claimableCount > 0) this.tabBadgeAchieve.textContent = String(claimableCount);

    // Eco progress inside Tree sidebar
    this.inspEcoVal.textContent = `${stats.ecoPercent}%`;
    this.inspEcoBar.style.width = `${stats.ecoPercent}%`;
    this.inspEcoSub.textContent = progress.victoryAchieved
      ? 'Pulau pulih sepenuhnya! Bebas maksimalkan seluruh kalibrasi.'
      : stats.bossUnlocked
        ? 'Badai Muson aktif di laguna! Kembali ke air untuk mengusir Kapal Limbah.'
        : 'Buka Rimba & Pelampung AI untuk mengakses Misi Final Badai Muson.';

    if (this.activeTab === 'cards') {
      this.renderCardsPanel(progress);
    } else if (this.activeTab === 'tree') {
      this.renderSkillTree(progress, stats);
      this.renderInspector(progress, stats);
    } else {
      this.renderAchievementsPanel(progress);
    }
  }

  private renderCardsPanel(progress: PlayerProgress): void {
    const blocks: string[] = [];

    for (const sec of CARD_SECTIONS) {
      const cardsHtml: string[] = [];
      for (const id of sec.ids) {
        const def = UPGRADE_MAP[id];
        const lv = progress.upgrades[id] ?? 0;
        const unlocked = isUpgradeUnlocked(id, progress.upgrades);
        const maxed = lv >= def.maxLevel;
        const cost = getUpgradeCost(id, lv);
        const canAfford = unlocked && !maxed && progress.coins >= cost;
        const reqNames = def.requires.map((r) => UPGRADE_MAP[r].shortName).join(' + ');

        cardsHtml.push(
          renderUpgradeCard({
            id: def.id,
            title: def.name,
            swatch: def.cardSwatch,
            icon: def.icon,
            level: lv,
            maxLevel: def.maxLevel,
            statLabel: def.statLabel,
            statIcon: def.icon,
            beforeText: def.statBefore(lv),
            afterText: def.statAfter(lv),
            desc: def.description,
            cost,
            unlocked,
            canAfford,
            maxed,
            lockedReason: reqNames,
            cornerTag: def.featuredTag,
            featured: def.featured,
          })
        );
      }

      blocks.push(`
        ${renderSectionDivider(sec.label, sec.icon)}
        <div class="cards-grid">${cardsHtml.join('')}</div>
      `);
    }

    this.cardsScroll.innerHTML = blocks.join('');
  }

  private renderSkillTree(progress: PlayerProgress, stats: ComputedStats): void {
    const paths: string[] = [];
    for (const def of UPGRADE_DEFS) {
      for (const reqId of def.requires) {
        const parent = UPGRADE_MAP[reqId];
        const parentOwned = (progress.upgrades[reqId] ?? 0) > 0;
        const childOwned = (progress.upgrades[def.id] ?? 0) > 0;
        const unlocked = isUpgradeUnlocked(def.id, progress.upgrades);

        const stateClass = childOwned
          ? `link-owned branch-${def.branch}`
          : unlocked && parentOwned
            ? `link-open branch-${def.branch}`
            : 'link-locked';

        const mx = (parent.x + def.x) * 0.5;
        const my = (parent.y + def.y) * 0.5;
        const d = `M ${parent.x} ${parent.y} Q ${mx} ${parent.y} ${mx} ${my} T ${def.x} ${def.y}`;
        paths.push(`<path class="tree-link-outline" d="${d}" />`);
        paths.push(`<path class="tree-link ${stateClass}" d="${d}" />`);
      }
    }
    this.treeLinks.innerHTML = paths.join('');

    this.treeNodes.innerHTML = '';
    for (const def of UPGRADE_DEFS) {
      const lv = progress.upgrades[def.id] ?? 0;
      const unlocked = isUpgradeUnlocked(def.id, progress.upgrades);
      const maxed = lv >= def.maxLevel;
      const cost = getUpgradeCost(def.id, lv);
      const canAfford = unlocked && !maxed && progress.coins >= cost;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.swatch = unlocked ? def.cardSwatch : 'dark';
      btn.className = [
        'tree-node',
        lv > 0 ? 'owned' : '',
        unlocked ? 'unlocked' : 'locked',
        maxed ? 'maxed' : '',
        canAfford ? 'affordable' : '',
        this.selectedNode === def.id ? 'selected' : '',
      ]
        .filter(Boolean)
        .join(' ');

      btn.style.left = `${(def.x / 1000) * 100}%`;
      btn.style.top = `${(def.y / 560) * 100}%`;

      const badgeText =
        def.id === 'core'
          ? 'INTI'
          : maxed
            ? 'MAKS'
            : unlocked
              ? `${lv}/${def.maxLevel}`
              : 'KUNCI';

      btn.innerHTML = `
        <span class="tree-node-lv t-stroke-xs num">${badgeText}</span>
        ${getUiIconSvg(def.icon, 'tree-node-icon')}
        <span class="tree-node-label t-stroke-xs">${def.shortName}</span>
        ${unlocked && !maxed ? `<span class="tree-node-cost t-stroke-xs num">${cost}</span>` : ''}
      `;

      btn.addEventListener('mouseenter', () => {
        if (this.selectedNode !== def.id) {
          this.selectedNode = def.id;
          this.updateSelectedNodeVisual();
          this.renderInspector(progress, stats);
        }
      });

      btn.addEventListener('click', () => {
        this.selectedNode = def.id;
        if (canAfford) {
          this.handlers.onBuyUpgrade(def.id, btn);
        } else {
          this.updateSelectedNodeVisual();
          this.renderInspector(progress, stats);
          if (def.id !== 'core' && !maxed) {
            this.handlers.onUiError?.();
          }
        }
      });

      this.treeNodes.appendChild(btn);
    }
  }

  private updateSelectedNodeVisual(): void {
    const nodes = this.treeNodes.querySelectorAll('.tree-node');
    UPGRADE_DEFS.forEach((def, idx) => {
      nodes[idx]?.classList.toggle('selected', def.id === this.selectedNode);
    });
  }

  private renderInspector(progress: PlayerProgress, stats: ComputedStats): void {
    const def = UPGRADE_MAP[this.selectedNode];
    const lv = progress.upgrades[def.id] ?? 0;
    const unlocked = isUpgradeUnlocked(def.id, progress.upgrades);
    const maxed = lv >= def.maxLevel;
    const cost = getUpgradeCost(def.id, lv);
    const canAfford = unlocked && !maxed && progress.coins >= cost;

    this.inspHeaderCard.dataset.swatch = unlocked ? BRANCH_SWATCH[def.branch] : 'dark';
    this.inspBranch.textContent = BRANCH_LABELS[def.branch];
    this.inspIcon.innerHTML = getUiIconSvg(def.icon);
    this.inspTitle.textContent = def.name;
    this.inspDesc.textContent = def.description;

    const reqNames = def.requires.map((r) => UPGRADE_MAP[r].shortName).join(' + ');
    let extraHtml = '';
    if (def.id === 'trash_rarity' || def.id === 'trash_density') {
      const rw = stats.rarityWeights;
      extraHtml = `
        <div class="rarity-pills">
          <span class="r-pill r-common">Umum ${rw.common}%</span>
          <span class="r-pill r-uncommon">Hijau ${rw.uncommon}%</span>
          ${rw.rare > 0 ? `<span class="r-pill r-rare">Langka ${rw.rare}%</span>` : ''}
          ${rw.epic > 0 ? `<span class="r-pill r-epic">Epik ${rw.epic}%</span>` : ''}
          ${rw.legendary > 0 ? `<span class="r-pill r-legendary">Legendaris ${rw.legendary}%</span>` : ''}
        </div>
      `;
    }

    const deltaText = maxed
      ? def.statBefore(lv)
      : `${def.statBefore(lv)} ➜ ${def.statAfter(lv)}`;

    this.inspStats.innerHTML = `
      <div class="insp-row"><span>Level</span><strong class="num">${lv} / ${def.maxLevel}</strong></div>
      <div class="insp-row"><span>${def.statLabel}</span><strong class="num">${deltaText}</strong></div>
      <div class="insp-row"><span>Efek</span><strong>${def.effectText(lv)}</strong></div>
      ${!unlocked ? `<div class="insp-row req-warn"><span>Syarat</span><strong>${reqNames}</strong></div>` : ''}
      ${extraHtml}
    `;

    if (def.id === 'core') {
      this.btnBuyNode.classList.add('hidden');
    } else {
      this.btnBuyNode.classList.remove('hidden');
      this.btnBuyNode.disabled = !canAfford;
      if (maxed) {
        this.btnBuyNode.dataset.swatch = 'gold';
        this.btnBuyNode.innerHTML = `${getUiIconSvg('check', 'ui-btn-icon')}<span>Sudah Maksimal</span>`;
      } else if (!unlocked) {
        this.btnBuyNode.dataset.swatch = 'slate';
        this.btnBuyNode.innerHTML = `${getUiIconSvg('lock', 'ui-btn-icon')}<span>Terkunci</span>`;
      } else {
        this.btnBuyNode.dataset.swatch = canAfford ? 'green' : 'slate';
        this.btnBuyNode.innerHTML = `${getUiIconSvg('coin', 'ui-btn-icon')}<span>Tingkatkan · ${cost.toLocaleString('id-ID')}</span>`;
      }
    }
  }

  private renderAchievementsPanel(progress: PlayerProgress): void {
    const ch1Ready = countClaimableAchievements(progress, 1);
    const ch2Ready = countClaimableAchievements(progress, 2);

    this.achChap1Btn.classList.toggle('is-active', this.activeAchChapter === 1);
    this.achChap2Btn.classList.toggle('is-active', this.activeAchChapter === 2);
    this.achChap1Btn.dataset.swatch = this.activeAchChapter === 1 ? 'orange' : 'slate';
    this.achChap2Btn.dataset.swatch = this.activeAchChapter === 2 ? 'orange' : 'slate';

    this.achBadge1.classList.toggle('hidden', ch1Ready === 0);
    if (ch1Ready > 0) this.achBadge1.textContent = String(ch1Ready);
    this.achBadge2.classList.toggle('hidden', ch2Ready === 0);
    if (ch2Ready > 0) this.achBadge2.textContent = String(ch2Ready);

    const list = ACHIEVEMENT_DEFS.filter((a) => a.chapter === this.activeAchChapter);
    let completed = 0;
    let earnedCoins = 0;
    let totalCoins = 0;

    for (const def of list) {
      totalCoins += def.rewardCoins;
      const done = def.getValue(progress) >= def.target;
      if (done) completed += 1;
      if (progress.claimedAchievements.includes(def.id)) {
        earnedCoins += def.rewardCoins;
      }
    }

    this.achCountLabel.textContent = `${completed} / ${list.length}`;
    this.achOverallBar.style.width = `${Math.round((completed / Math.max(1, list.length)) * 100)}%`;
    this.achCoinsLabel.textContent = `${earnedCoins.toLocaleString('id-ID')} / ${totalCoins.toLocaleString('id-ID')}`;

    // Sort claimable achievements to the top for instant dopamine!
    const sorted = [...list].sort((a, b) => {
      const aClaimable = isAchievementClaimable(a, progress) ? 0 : progress.claimedAchievements.includes(a.id) ? 2 : 1;
      const bClaimable = isAchievementClaimable(b, progress) ? 0 : progress.claimedAchievements.includes(b.id) ? 2 : 1;
      return aClaimable - bClaimable;
    });

    this.achieveGrid.innerHTML = sorted
      .map((def) =>
        renderAchievementCard({
          id: def.id,
          title: def.title,
          desc: def.desc,
          swatch: def.swatch,
          icon: def.icon,
          current: def.getValue(progress),
          target: def.target,
          rewardCoins: def.rewardCoins,
          claimed: progress.claimedAchievements.includes(def.id),
        })
      )
      .join('');
  }

  public renderVictory(progress: PlayerProgress): void {
    this.victoryStats.innerHTML = [
      renderStatTile('Total Ombak', progress.totalWaves.toLocaleString('id-ID'), 'wave', 'blue'),
      renderStatTile('Muatan Bersih', progress.totalTrash.toLocaleString('id-ID'), 'net', 'green'),
      renderStatTile('Muatan Langka+', progress.totalRareTrash.toLocaleString('id-ID'), 'rarity', 'purple'),
      renderStatTile('Mangrove Tumbuh', `${progress.mangroves.length} Pohon`, 'mangrove', 'teal'),
      renderStatTile('Perahu & Api', `${progress.totalBoats} / ${progress.totalFires}`, 'boat', 'orange'),
      renderStatTile('Total Koin', progress.totalCoinsEarned.toLocaleString('id-ID'), 'coin', 'gold'),
    ].join('');
    spawnUiConfetti(null, 42);
  }
}
