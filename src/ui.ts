import type {
  ComputedStats,
  GamePhase,
  PlayerProgress,
  ShopTab,
  TimeOfDay,
  UpgradeBranch,
  UpgradeId,
} from './types';
import { isWritten, JOURNAL, unreadPages, type JournalEntry } from './journal';
import { browserStore, loadBest, type BestRecord } from './save';
import type { WaveHudState } from './story/director';
import type { Objective } from './story/jobs';
import type { Mood, TalkLine } from './story/talk';
import { dayTitle, nextSupply, P_DIRTY, P_HEALTHY, REPAIR_HEAL } from './story/state';
import {
  countAffordableUpgrades,
  getUpgradeCost,
  isForSale,
  isUpgradeShown,
  UPGRADE_DEFS,
  UPGRADE_MAP,
} from './upgrades';
import { getUiIconSvg, type UiIconName } from './ui-kit/icons';
import type { QualitySetting, Tier } from './scene/quality';
import type { QualityState } from './scene/SceneRenderer';
import { TEXT_CPS, type GameSettings, type VolumeChannel } from './settings';
import { RadioCard, Speech, type VoiceLink } from './ui-radio';
import { SettingsPanel } from './ui-settings';
import {
  renderJournalEntry,
  renderJournalRecord,
  renderStatTile,
  spawnUiConfetti,
  type UiSwatch,
} from './ui-kit/templates';

const TIME_META: Record<TimeOfDay, { label: string; swatch: UiSwatch; icon: UiIconName }> = {
  morning: { label: 'PAGI CERAH', swatch: 'blue', icon: 'sun' },
  noon: { label: 'SIANG BERKILAU', swatch: 'blue', icon: 'sun' },
  sunset: { label: 'SENJA PESISIR', swatch: 'orange', icon: 'sunset' },
  night: { label: 'MALAM SERBUAN', swatch: 'purple', icon: 'moon' },
  monsoon: { label: 'BADAI MUSON', swatch: 'red', icon: 'storm' },
  dawn: { label: 'FAJAR HARMONI', swatch: 'gold', icon: 'dawn' },
};

const BRANCH_LABELS: Record<UpgradeBranch, string> = {
  core: 'INTI A.L.U.N.',
  wave: 'CABANG OMBAK',
  energy: 'CABANG ENERGI',
  ai: 'MODUL AI A.L.U.N.',
  eco: 'DESA & PESISIR',
  final: 'PERTAHANAN DERMAGA',
};

const BRANCH_SWATCH: Record<UpgradeBranch, UiSwatch> = {
  core: 'teal',
  wave: 'blue',
  energy: 'orange',
  ai: 'teal',
  eco: 'green',
  final: 'red',
};

const TIER_LABELS: Record<Tier, string> = {
  low: 'Rendah',
  medium: 'Sedang',
  high: 'Tinggi',
  ultra: 'Ultra',
};

/** The workshop map is a grid of 7 columns and 4 rows; each tool's col and row put it in its own cell. */
const MAP_COLS = 7;
const MAP_ROWS = 4;
/** Every tool is this many times as wide as it is tall, at any size. */
const NODE_RATIO = 1.3;
/** The tallest a tool gets, and the smallest type its name may have before the map pans instead. */
const NODE_MAX_H = 86;
const NODE_MIN_FONT = 9.5;
/** Room between tools as parts of a tool's height: least, then most when the map has space to spare. */
const GAP_X: [number, number] = [0.42, 1.1];
const GAP_Y: [number, number] = [0.4, 0.9];

/** Screen pixels per layout pixel: below 1 while a modal zooms in, and measurements must not follow it. */
function layoutScale(node: HTMLElement): number {
  const w = node.getBoundingClientRect().width;
  return node.offsetWidth > 0 && w > 0 ? w / node.offsetWidth : 1;
}

/** The tool panel's steps, in order: smaller type, then no stars, then (beside a note) no description. */
const PANEL_FIT: ReadonlyArray<{ k: number; pips?: false; desc?: false }> = [
  { k: 1 },
  { k: 0.92 },
  { k: 0.85 },
  { k: 0.85, pips: false },
  { k: 0.8, pips: false },
  { k: 0.8, pips: false, desc: false },
  { k: 0.74, pips: false, desc: false },
];

/**
 * A one-line label that does not fit its button gets smaller type instead of being cut; when even 12px
 * is too wide, a button that allows it takes the label on two lines within its own height.
 */
function fitLine(btn: HTMLElement, wrap = false): void {
  btn.style.fontSize = '';
  btn.classList.remove('is-wrapped');
  if (btn.classList.contains('hidden') || !btn.clientWidth) return;
  const full = parseFloat(getComputedStyle(btn).fontSize);
  let size = full;
  while (btn.scrollWidth > btn.clientWidth + 1 && size > 12) {
    size -= 1;
    btn.style.fontSize = `${size}px`;
  }
  if (!wrap || btn.scrollWidth <= btn.clientWidth + 1) return;
  const height = btn.offsetHeight;
  btn.classList.add('is-wrapped');
  size = Math.min(full, 15);
  btn.style.fontSize = `${size}px`;
  while ((btn.scrollWidth > btn.clientWidth + 1 || btn.offsetHeight > height) && size > 11) {
    size -= 1;
    btn.style.fontSize = `${size}px`;
  }
}

const CLOSED_SHOP = 'Bengkel masih tutup: dorong peti perkakas Bu Sari ke ujung dermaga.';
const NIGHT_SHOP = 'Bu Sari berjaga di suar! Bengkel buka kembali saat fajar.';
const SAVE_FAILED = 'Browser menolak menyimpan. Progres hilang kalau halaman ditutup.';

/** How long a written radio line stays once it is all there: long enough to read again. */
const radioHold = (text: string): number => Math.min(4.5, 1.4 + text.length * 0.022);
type HudMessage = { text: string; seconds: number; swatch: UiSwatch };
type RadioLine = { sender: string; text: string; mood?: Mood };

export interface UIHandlers {
  onStartNew: () => void;
  onContinue: () => void;
  onOpenShop: (tab?: ShopTab) => void;
  onCloseShop: () => void;
  onBuyUpgrade: (id: UpgradeId, originEl?: HTMLElement | null) => void;
  onRepairPier: (originEl?: HTMLElement | null) => void;
  onRetryFromDay1: () => void;
  onDefeatTitle: () => void;
  onReadJournal: (part: JournalEntry['part']) => void;
  onResetSave: () => void;
  /** A setting was changed in the settings window. */
  onSettingsChange?: (s: GameSettings, what: string) => void;
  /** A volume slider was let go: play something on that channel. */
  onSampleVolume?: (channel: VolumeChannel) => void;
  /** The voices behind the radio card and Bu Sari's scenes. */
  voice?: VoiceLink;
  /** Bu Sari started (true) or finished (false) a scene the lagoon waits for. */
  onTalk?: (on: boolean) => void;
  onStartEndless: () => void;
  onOpenShopFromVictory: () => void;
  onSelectQuality: (setting: QualitySetting) => void;
  onSettingsToggle?: (open: boolean) => void;
  onSkipIntro: () => void;
  onTabSwitch?: () => void;
  onUiClick?: () => void;
  onUiError?: () => void;
}

const el = (id: string): HTMLElement => document.getElementById(id)!;

export class GameUI {
  private app = el('app');
  private hud = el('hud');
  private titleScreen = el('title-screen');
  private introOverlay = el('intro-overlay');
  private introCaption = el('intro-caption');
  private introKicker = el('intro-kicker');
  private introLine = el('intro-line');
  private swipeHint = el('swipe-hint');
  private swipeLine = el('swipe-hint-line');
  private swipeHead = el('swipe-hint-head');
  private swipeDot = el('swipe-hint-dot');
  private playfield = el('hud-playfield');
  private guideBounds = new DOMRect();
  private pointer = el('target-pointer');
  private pointerArrow = el('target-pointer-arrow');
  private upgradeScreen = el('upgrade-screen');
  private victoryScreen = el('victory-screen');
  private defeatScreen = el('defeat-screen');
  private defeatSub = el('defeat-sub');
  private defeatStats = el('defeat-stats');
  private titleBest = el('title-best');
  private creditsModal = el('credits-modal');
  private confirmModal = el('confirm-modal');
  private confirmTitle = el('confirm-title');
  private confirmText = el('confirm-text');
  private btnConfirmYes = el('btn-confirm-yes') as HTMLButtonElement;
  private btnConfirmNo = el('btn-confirm-no') as HTMLButtonElement;
  private settingsModal = el('settings-modal');
  private settingsActiveChip = el('settings-active-chip');
  private settingsResChip = el('settings-res-chip');
  private graphicsOptions = el('graphics-options');
  private webglErrorModal = el('webgl-error-modal');
  private webglErrorTitle = el('webgl-error-title');
  private webglErrorMsg = el('webgl-error-msg');
  private webglErrorTip = el('webgl-error-tip');
  private btnWebglRetry = el('btn-webgl-retry') as HTMLButtonElement;
  private settingsOpen = false;
  private settingsReturnFocus: HTMLElement | null = null;
  private confirmReturnFocus: HTMLElement | null = null;
  private confirmYes: (() => void) | null = null;

  private hudCoinPill = el('hud-coin-pill');
  private hudCoins = el('hud-coins');
  private hudEnergy = el('hud-energy');
  private hudComboPill = el('hud-combo-pill');
  private hudComboVal = el('hud-combo-val');
  private hudSaveWarning = el('hud-save-warning');
  private hudEnergyVal = el('hud-energy-val');
  private hudEnergyBar = el('hud-energy-bar');
  private hudTimePill = el('hud-time-pill');
  private hudTimeIcon = el('hud-time-icon');
  private hudDayLabel = el('hud-day-label');
  private hudWaveWrap = el('hud-wave-wrap');
  private hudWaveTitle = el('hud-wave-title');
  private hudWaveSub = el('hud-wave-sub');
  private hudWaveFill = el('hud-wave-fill');
  private hudWaveFlags = el('hud-wave-flags');
  private waveBanner = el('wave-banner');
  private waveBannerTitle = el('wave-banner-title');
  private waveBannerSub = el('wave-banner-sub');
  private bannerTimer = 0;
  private hudPierWrap = el('hud-pier-wrap');
  private hudPierBar = el('hud-pier-bar');
  private hudPierVal = el('hud-pier-val');
  private hudPierIcon = el('hud-pier-icon');
  private hudEcoWrap = el('hud-eco-wrap');
  private hudEcoBar = el('hud-eco-bar');
  private hudEcoPct = el('hud-eco-pct');
  private hudEcoIcon = el('hud-eco-icon');
  private hudBossPill = el('hud-boss-pill');
  private hudBossBar = el('hud-boss-bar');
  private hudBossVal = el('hud-boss-val');
  private btnRepairPier = el('btn-repair-pier') as HTMLButtonElement;
  private repairPierLabel = el('repair-pier-label');

  private btnOpenShop = el('btn-open-shop') as HTMLButtonElement;
  private shopBtnIcon = el('shop-btn-icon');
  private shopBtnLabel = el('shop-btn-label');
  private shopBadge = el('shop-badge');
  private btnOpenJournal = el('btn-open-journal') as HTMLButtonElement;
  private actionStack = el('hud-action-stack');
  private journalBadge = el('journal-badge');

  private hudObjective = el('hud-objective') as HTMLDetailsElement;
  private missionChapterTitle = el('mission-chapter-title');
  private hudObjKicker = el('hud-obj-kicker');
  private hudObjTitle = el('hud-obj-title');
  private hudObjProgress = el('hud-obj-progress');
  private hudObjSub = el('hud-obj-sub');

  private textCps = TEXT_CPS.normal;
  private radio = new RadioCard(el('radio-toast'));
  private radioSpeech = new Speech(this.radio, () => this.handlers.voice, () => this.textCps);
  /** Written lines waiting their turn, the one on screen, and how long it stays once said. */
  private radioQueue: RadioLine[] = [];
  private radioOn: RadioLine | null = null;
  private radioLeft = 0;
  private radioTotal = 0;
  /** Bu Sari's scene: the lagoon waits while she talks, and a click goes on. */
  private talkLayer = el('talk-layer');
  private talkCard = new RadioCard(el('talk-card'));
  private talkSpeech = new Speech(this.talkCard, () => this.handlers.voice, () => this.textCps);
  private talkQueue: RadioLine[] = [];
  private talkActive = false;
  private settingsPanel: SettingsPanel | null = null;

  private btnPlay = el('btn-play') as HTMLButtonElement;
  private btnContinue = el('btn-continue') as HTMLButtonElement;
  private continueLabel = el('continue-label');
  private shopRibbon = el('shop-ribbon');
  private tabTree = el('tab-tree') as HTMLButtonElement;
  private tabJournal = el('tab-journal') as HTMLButtonElement;
  private tabBadgeTree = el('tab-badge-tree');
  private tabBadgeJournal = el('tab-badge-journal');
  private panelTree = el('panel-tree');
  private panelJournal = el('panel-journal');

  private runSummaryChips = el('run-summary-chips');
  private upgradeCoins = el('upgrade-coins');
  private treeMap = el('tree-map');
  private treeCanvas = el('tree-canvas');
  private treeLinks = el('tree-links');
  private treeNodes = el('tree-nodes');
  private shopToast = el('shop-toast');
  private toastTimer = 0;
  /** The buttons on the map, kept between renders so that focus and position survive a purchase. */
  private nodeEls = new Map<UpgradeId, HTMLButtonElement>();
  /** Centres of the tools on the map's canvas, which is as big as the whole grid. */
  private nodeAt = new Map<UpgradeId, { x: number; y: number }>();
  /** Tool size and spacing at this size of the map; vw and vh are the part of the canvas on view. */
  private treeGeom = { w: 0, h: 0, gapX: 0, pad: 0, cw: 0, ch: 0, vw: 0, vh: 0 };
  /** Where the canvas sits in the map: it only moves when the player drags it or opens the workshop. */
  private pan = { x: 0, y: 0 };
  private panAxes = { x: false, y: false };
  private panToTools = true;
  private panDragged = false;
  private panGlideTimer = 0;

  private toolPanel = el('tool-panel');
  private toolBottom = this.toolPanel.querySelector('.tool-bottom') as HTMLElement;
  private inspHeaderCard = el('insp-header-card');
  private inspBranch = el('insp-branch');
  private inspIcon = el('insp-icon');
  private inspTitle = el('insp-title');
  private inspDesc = el('insp-desc');
  private inspPips = el('insp-pips');
  private inspStats = el('insp-stats');
  private toolNote = el('tool-note');
  private btnBuyNode = el('btn-buy-node') as HTMLButtonElement;
  private btnReturn = el('btn-return-lagoon') as HTMLButtonElement;

  private journalPart1 = el('journal-part-1') as HTMLButtonElement;
  private journalPart2 = el('journal-part-2') as HTMLButtonElement;
  private journalBadge1 = el('journal-badge-1');
  private journalBadge2 = el('journal-badge-2');
  private journalBook = el('journal-book');
  private journalSpread = el('journal-spread');
  private journalPrev = el('journal-prev') as HTMLButtonElement;
  private journalNext = el('journal-next') as HTMLButtonElement;
  private journalPageLabel = el('journal-page');
  private journalLeaves: string[] = [];
  /** Keep this leaf in view if the book changes from one page to two. */
  private journalAnchor: Record<JournalEntry['part'], number | null> = { cerita: null, patroli: null };
  private journalPerPage = 1;
  private journalPages = 1;
  private journalPageIndex = 0;
  private journalWheel = 0;
  private journalWheelAt = 0;

  private victoryStats = el('victory-stats');

  private activeTab: ShopTab = 'tree';
  public sawWorkshopTools = false;
  private activePart: JournalEntry['part'] = 'cerita';
  /** Pages that were new when the journal was opened; they keep their mark while it stays open. */
  private freshPages = new Set<string>();
  private selectedNode: UpgradeId = 'wave_width';
  private notice = el('hud-notice');
  private messages: HudMessage[] = [];
  private messageLeft = 0;
  private displayedCoins = -1;
  private lastHudCoinsText = '';
  private lastComboText = '';
  private lastEnergyText = '';
  private lastEnergyWidth = '';
  private lastEnergySwatch = '';
  private lastEcoPct = -1;
  private lastPierSig = '';
  private lastWaveSig = '';
  private lastFlagsSig = '';
  private lastBossShown: boolean | null = null;
  private lastBossPct = -1;
  private lastShopSig = '';
  private lastTimeKey: TimeOfDay | null = null;
  private lastObjectiveKey = '';
  private currentProgress: PlayerProgress | null = null;
  private currentStats: ComputedStats | null = null;
  private currentWave: WaveHudState | null = null;
  private headline = '';
  private handlers: UIHandlers;

  constructor(handlers: UIHandlers) {
    this.handlers = handlers;
    this.mountStaticIcons();
    this.bindStaticEvents();
    // anywhere on the lagoon goes on with Bu Sari's scene
    this.talkLayer.addEventListener('click', () => this.advanceTalk());
    const observer = new ResizeObserver(() => {
      this.guideBounds = this.playfield.getBoundingClientRect();
    });
    for (const region of this.hud.children) observer.observe(region);
    observer.observe(this.hud);
  }

  private mountStaticIcons(): void {
    const icons: Record<string, UiIconName> = {
      'hud-coin-icon': 'coin',
      'shop-coin-icon': 'coin',
      'hud-energy-icon': 'wave',
      'hud-pier-icon': 'shield',
      'repair-pier-icon': 'shield',
      'hud-eco-icon': 'eco',
      'hud-boss-icon': 'boss',
      'hud-save-icon': 'warn',
      'journal-btn-icon': 'journal',
      'title-emblem': 'wave',
      'title-play-icon': 'play',
      'title-continue-icon': 'play',
      'title-settings-icon': 'settings',
      'btn-hud-settings': 'settings',
      'title-info-icon': 'info',
      'tab-icon-tree': 'tree',
      'tab-icon-journal': 'journal',
      'confirm-icon': 'warn',
      'btn-close-shop': 'close',
      'btn-close-credits': 'close',
      'btn-close-settings': 'close',
      'journal-prev': 'arrow_right',
      'journal-next': 'arrow_right',
      'tool-return-icon': 'wave',
    };
    for (const id in icons) el(id).innerHTML = getUiIconSvg(icons[id]);
  }

  private bindStaticEvents(): void {
    const click = (id: string, fn: (e: Event) => void): void => el(id).addEventListener('click', fn);

    this.btnPlay.addEventListener('click', () => {
      this.handlers.onUiClick?.();
      this.handlers.onStartNew();
    });
    this.btnContinue.addEventListener('click', () => {
      this.handlers.onUiClick?.();
      this.handlers.onContinue();
    });
    click('btn-skip-intro', () => this.handlers.onSkipIntro());
    this.btnOpenShop.addEventListener('click', () => this.handlers.onOpenShop('tree'));
    this.btnOpenJournal.addEventListener('click', () => this.handlers.onOpenShop('journal'));

    const openSettingsFrom = (e: Event): void => {
      this.handlers.onUiClick?.();
      this.openSettings(e.currentTarget as HTMLElement);
    };
    click('btn-title-settings', openSettingsFrom);
    click('btn-hud-settings', openSettingsFrom);
    const closeSettings = (): void => {
      this.handlers.onUiClick?.();
      this.closeSettings();
    };
    click('btn-close-settings', closeSettings);
    click('btn-close-settings-ok', closeSettings);
    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) closeSettings();
    });
    this.graphicsOptions.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-quality]');
      if (!btn) return;
      this.handlers.onTabSwitch?.();
      this.handlers.onSelectQuality(btn.dataset.quality as QualitySetting);
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
        this.handlers.onTabSwitch?.();
        this.handlers.onSelectQuality(btns[next].dataset.quality as QualitySetting);
      }
    });
    this.btnWebglRetry.addEventListener('click', () => {
      location.reload();
    });

    this.hudSaveWarning.addEventListener('click', () => this.queueNotice(SAVE_FAILED, 'red', 5));

    click('btn-close-shop', () => this.handlers.onCloseShop());
    click('btn-return-lagoon', () => this.handlers.onCloseShop());
    this.upgradeScreen.addEventListener('click', (e) => {
      if (e.target === this.upgradeScreen) this.handlers.onCloseShop();
    });

    this.tabTree.addEventListener('click', () => this.setShopTab('tree'));
    this.tabJournal.addEventListener('click', () => this.setShopTab('journal'));

    this.tabTree.parentElement!.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      this.setShopTab(this.activeTab === 'tree' ? 'journal' : 'tree');
    });

    const openPart = (part: JournalEntry['part']): void => {
      if (this.activePart === part) return;
      this.activePart = part;
      this.handlers.onTabSwitch?.();
      if (this.currentProgress) this.renderJournal(this.currentProgress);
    };
    this.journalPart1.addEventListener('click', () => openPart('cerita'));
    this.journalPart2.addEventListener('click', () => openPart('patroli'));
    this.journalPart1.parentElement!.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      openPart(this.activePart === 'cerita' ? 'patroli' : 'cerita');
      (this.activePart === 'cerita' ? this.journalPart1 : this.journalPart2).focus({ preventScroll: true });
    });
    this.bindWorkshopEvents();

    this.btnConfirmNo.addEventListener('click', () => {
      this.handlers.onUiClick?.();
      this.closeConfirm();
    });
    this.btnConfirmYes.addEventListener('click', () => {
      this.handlers.onUiClick?.();
      const yes = this.confirmYes;
      this.closeConfirm();
      yes?.();
    });
    this.confirmModal.addEventListener('click', (e) => {
      if (e.target === this.confirmModal) this.closeConfirm();
    });

    click('btn-credits', () => {
      this.handlers.onUiClick?.();
      this.creditsModal.classList.remove('hidden');
    });
    const closeCredits = (): void => {
      this.handlers.onUiClick?.();
      this.creditsModal.classList.add('hidden');
    };
    click('btn-close-credits', closeCredits);
    click('btn-close-credits-ok', closeCredits);
    this.creditsModal.addEventListener('click', (e) => {
      if (e.target === this.creditsModal) closeCredits();
    });

    click('btn-endless', () => {
      this.handlers.onUiClick?.();
      this.handlers.onStartEndless();
    });
    click('btn-victory-shop', () => {
      this.handlers.onUiClick?.();
      this.handlers.onOpenShopFromVictory();
    });
    click('btn-retry-run', () => {
      this.handlers.onUiClick?.();
      this.handlers.onRetryFromDay1();
    });
    click('btn-defeat-title', () => {
      this.handlers.onUiClick?.();
      this.handlers.onDefeatTitle();
    });
    this.btnRepairPier.addEventListener('click', () => {
      this.handlers.onRepairPier(this.btnRepairPier);
    });
    this.btnBuyNode.addEventListener('click', () => {
      if (this.btnBuyNode.disabled) {
        this.handlers.onUiError?.();
        return;
      }
      this.handlers.onBuyUpgrade(this.selectedNode, this.btnBuyNode);
    });
  }

  /** Why the workshop will not open yet, for whoever tries the door. */
  public explainClosedShop(): void {
    this.handlers.onUiError?.();
    this.queueNotice(CLOSED_SHOP, 'red', 3);
  }

  public explainNightShop(): void {
    this.handlers.onUiError?.();
    this.queueNotice(NIGHT_SHOP, 'purple', 3);
  }

  /** The settings window beyond graphics: built once, with what the player chose last time. */
  public initSettings(settings: GameSettings): void {
    this.settingsPanel = new SettingsPanel(this.settingsModal, settings, {
      change: (s, what) => this.handlers.onSettingsChange?.(s, what),
      tab: () => this.handlers.onTabSwitch?.(),
      click: () => this.handlers.onUiClick?.(),
      sample: (ch) => this.handlers.onSampleVolume?.(ch),
      resetSave: () => this.handlers.onResetSave(),
    });
    this.applySettings(settings);
  }

  /** Settings changed somewhere (a key, a reset): the window and the radio follow. */
  public applySettings(settings: GameSettings): void {
    this.settingsPanel?.set(settings);
    this.textCps = TEXT_CPS[settings.textSpeed];
  }

  /* ================================================================ windows */

  public isSettingsOpen(): boolean {
    return this.settingsOpen;
  }

  public isCreditsOpen(): boolean {
    return !this.creditsModal.classList.contains('hidden');
  }

  public closeCredits(): void {
    this.creditsModal.classList.add('hidden');
  }

  /** Asks before something is lost. The safe answer has the focus. */
  public confirm(title: string, text: string, yesLabel: string, onYes: () => void): void {
    this.confirmTitle.textContent = title;
    this.confirmText.textContent = text;
    this.btnConfirmYes.textContent = yesLabel;
    this.confirmYes = onYes;
    this.confirmReturnFocus = document.activeElement as HTMLElement | null;
    this.confirmModal.classList.remove('hidden');
    this.btnConfirmNo.focus();
  }

  public isConfirmOpen(): boolean {
    return !this.confirmModal.classList.contains('hidden');
  }

  public closeConfirm(): void {
    this.confirmYes = null;
    this.confirmModal.classList.add('hidden');
    this.confirmReturnFocus?.focus();
    this.confirmReturnFocus = null;
  }

  public openSettings(returnFocus?: HTMLElement | null): void {
    if (this.settingsOpen) return;
    this.settingsOpen = true;
    this.syncHudVisibility();
    this.settingsReturnFocus = returnFocus ?? (document.activeElement as HTMLElement | null);
    this.settingsModal.classList.remove('hidden');
    this.handlers.onSettingsToggle?.(true);
    if (this.settingsPanel && this.settingsPanel.activePane !== 'graphics') {
      this.settingsPanel.focusTarget().focus();
      return;
    }
    const active =
      this.graphicsOptions.querySelector<HTMLButtonElement>('.graphics-opt.is-selected') ??
      this.graphicsOptions.querySelector<HTMLButtonElement>('[data-quality]');
    active?.focus();
  }

  public closeSettings(): void {
    if (!this.settingsOpen) return;
    this.settingsOpen = false;
    this.syncHudVisibility();
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
    el('graphics-warning').hidden = state.recommendedTier === 'high' || state.recommendedTier === 'ultra';
  }

  public showPerfHint(suggested: Tier): void {
    const label = TIER_LABELS[suggested];
    this.queueNotice(`Performa terasa berat. Coba grafis ${label} di Pengaturan [G]`, 'orange', 4.2);
  }

  public showWebglError(title: string, message: string, tip: string, showRetry = true): void {
    this.webglErrorTitle.textContent = title;
    this.webglErrorMsg.textContent = message;
    this.webglErrorTip.textContent = tip;
    this.btnWebglRetry.classList.toggle('hidden', !showRetry);
    this.webglErrorModal.classList.remove('hidden');
    this.syncHudVisibility();
  }

  public hideWebglError(): void {
    this.webglErrorModal.classList.add('hidden');
    this.syncHudVisibility();
  }

  private syncHudVisibility(): void {
    const visible = this.app.dataset.phase === 'playing' && !this.settingsOpen &&
      this.introOverlay.classList.contains('hidden') && this.webglErrorModal.classList.contains('hidden');
    this.hud.classList.toggle('hidden', !visible);
  }

  public showPhase(phase: GamePhase): void {
    this.app.dataset.phase = phase;
    this.titleScreen.classList.toggle('hidden', phase !== 'title');
    if (phase === 'intro' && this.introOverlay.classList.contains('hidden')) this.setIntroCaption('', '');
    this.introOverlay.classList.toggle('hidden', phase !== 'intro');
    this.syncHudVisibility();
    this.upgradeScreen.classList.toggle('hidden', phase !== 'upgrade');
    this.victoryScreen.classList.toggle('hidden', phase !== 'victory');
    this.defeatScreen.classList.toggle('hidden', phase !== 'defeat');
    if (phase === 'upgrade') {
      this.layoutShop();
      (this.activeTab === 'tree' ? this.tabTree : this.tabJournal).focus({ preventScroll: true });
    } else this.hideShopToast();
  }

  public setTitleBest(best: BestRecord): void {
    const show = best.bestDay > 0 || best.bestNights > 0;
    this.titleBest.classList.toggle('hidden', !show);
    if (show) {
      this.titleBest.textContent = `Rekor Terbaik · Hari ${best.bestDay} (${best.bestNights} malam · ${best.bestPirates} kapal)`;
    }
  }

  /** With a story to continue, continuing is the big button; without one, starting is. */
  public setTitleSave(chapter: string | null): void {
    const has = chapter !== null;
    this.btnContinue.classList.toggle('hidden', !has);
    if (has) this.continueLabel.textContent = `Lanjutkan · ${chapter}`;
    this.btnPlay.dataset.swatch = has ? 'blue' : 'green';
    this.btnPlay.classList.toggle('ui-btn-lg', !has);
    this.btnPlay.classList.toggle('t-stroke-md', !has);
    this.btnPlay.classList.toggle('t-stroke-sm', has);
  }

  /** A new story or an erased one: nothing on screen may come from the old one. */
  public forgetProgress(): void {
    this.displayedCoins = -1;
    this.lastHudCoinsText = '';
    this.lastShopSig = '';
    this.lastEcoPct = -1;
    this.lastPierSig = '';
    this.lastWaveSig = '';
    this.lastFlagsSig = '';
    this.lastObjectiveKey = '';
    this.messages.length = 0;
    this.messageLeft = 0;
    this.radioQueue.length = 0;
    if (this.radioOn) this.radioSpeech.stop(false);
    this.radioOn = null;
    this.radioLeft = 0;
    this.radio.hideNow();
    this.talkQueue.length = 0;
    if (this.talkActive) this.endTalk(false);
    this.bannerTimer = 0;
    this.waveBanner.classList.add('hidden');
    this.hud.removeAttribute('data-ready');
    this.notice.classList.add('hidden');
    this.hudObjective.open = false;
    this.activeTab = 'tree';
    this.activePart = 'cerita';
    this.freshPages.clear();
    this.journalAnchor = { cerita: null, patroli: null };
    this.selectedNode = 'wave_width';
  }

  public setSaveWarning(failed: boolean): void {
    this.hudSaveWarning.classList.toggle('hidden', !failed);
    if (failed) this.queueNotice(SAVE_FAILED, 'red', 6);
  }

  /* ================================================================ films and hints */

  /** Letterbox and subtitles over play, for a short film in the middle of the game; the HUD steps aside. */
  public setFilm(on: boolean): void {
    if (on && this.introOverlay.classList.contains('hidden')) this.setIntroCaption('', '');
    this.introOverlay.classList.toggle('hidden', !on);
    this.syncHudVisibility();
  }

  /** The opening's subtitle. Two empty strings fade it out. */
  public setIntroCaption(kicker: string, line: string): void {
    if (!line) {
      this.introCaption.classList.add('is-out');
      return;
    }
    this.introKicker.textContent = kicker;
    this.introLine.textContent = line;
    // restart the fade so each new line arrives on its own
    this.introCaption.classList.add('is-out');
    void this.introCaption.offsetWidth;
    this.introCaption.classList.remove('is-out');
  }

  public showChapter(n: number): void {
    this.hudObjective.open = n <= 1;
    this.missionChapterTitle.hidden = n <= 1;
    this.hudObjKicker.textContent = `Hari ${n}`;
    this.missionChapterTitle.textContent = dayTitle(n);
  }

  public showWaveBanner(title: string, sub: string, swatch: UiSwatch = 'orange'): void {
    this.waveBanner.dataset.swatch = swatch;
    this.waveBannerTitle.textContent = title;
    this.waveBannerSub.textContent = sub;
    this.waveBanner.classList.remove('hidden');
    void this.waveBanner.offsetWidth;
    this.bannerTimer = 3.2;
  }

  public pulsePier(): void {
    this.hudPierWrap.classList.remove('is-hurt');
    void this.hudPierWrap.offsetWidth;
    this.hudPierWrap.classList.add('is-hurt');
  }

  /** Mark the start of the gesture and its direction on the same plane the input uses. */
  public updateSwipeHint(h: { ax: number; ay: number; bx: number; by: number } | null): boolean {
    const bounds = this.guideBounds;
    const margin = 7;
    const visible = h !== null &&
      Math.min(h.ax, h.bx) >= bounds.left + margin && Math.max(h.ax, h.bx) <= bounds.right - margin &&
      Math.min(h.ay, h.by) >= bounds.top + margin && Math.max(h.ay, h.by) <= bounds.bottom - margin;
    this.swipeHint.classList.toggle('hidden', !visible);
    if (!visible || !h) return false;
    const ax = h.ax - bounds.left;
    const ay = h.ay - bounds.top;
    const bx = h.bx - bounds.left;
    const by = h.by - bounds.top;
    const set = (node: Element, attrs: Record<string, number | string>): void => {
      for (const k in attrs) node.setAttribute(k, String(attrs[k]));
    };
    set(this.swipeLine, { x1: ax.toFixed(1), y1: ay.toFixed(1), x2: bx.toFixed(1), y2: by.toFixed(1) });
    set(this.swipeDot, { cx: ax.toFixed(1), cy: ay.toFixed(1) });
    const angle = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
    this.swipeHead.setAttribute('transform', `translate(${bx.toFixed(1)} ${by.toFixed(1)}) rotate(${angle.toFixed(1)})`);
    return true;
  }

  /** Only a target beyond the viewport needs an edge arrow. */
  public updatePointer(p: { x: number; y: number } | null): void {
    const r = this.guideBounds;
    const visible = p !== null && r.width >= 80 && r.height >= 64;
    this.pointer.classList.toggle('hidden', !visible);
    if (!p || !visible) return;
    const off = p.x < r.left || p.x > r.right || p.y < r.top || p.y > r.bottom;
    const x = off ? Math.max(r.left + 26, Math.min(r.right - 26, p.x)) : p.x;
    const y = off ? Math.max(r.top + 26, Math.min(r.bottom - 26, p.y)) : p.y;
    this.pointer.style.transform = `translate(${(x - r.left).toFixed(1)}px, ${(y - r.top).toFixed(1)}px)`;
    const turn = off ? Math.atan2(p.y - y, p.x - x) - Math.PI / 2 : 0;
    this.pointerArrow.style.transform = `rotate(${turn.toFixed(3)}rad) translateY(-12px)`;
  }

  /* ================================================================ radio */

  /**
   * Two queues side by side: people on the radio take their time to talk, so rewards and
   * warnings do not wait behind them; they show above the radio card instead.
   */
  private enqueue(message: HudMessage): void {
    if (this.messages.some((queued) => queued.text === message.text)) return;
    if (this.messageLeft > 0 && message.text === this.notice.textContent) return;
    // Keep the latest events relevant when several rewards arrive at once.
    if (this.messages.length === 4) this.messages.shift();
    this.messages.push(message);
  }

  /** A written line over the radio. Lines take turns: none is cut off by the next. */
  public showRadio(sender: string, text: string, mood?: Mood): void {
    if (this.radioQueue.some((q) => q.text === text) || this.radioOn?.text === text) return;
    // a burst of news keeps the latest: the oldest waiting line gives way, never the one being said
    if (this.radioQueue.length === 4) this.radioQueue.shift();
    this.radioQueue.push({ sender, text, mood });
    if (mood) this.handlers.voice?.prefetch(sender, mood);
  }

  /**
   * Bu Sari says something. With `hold` the lagoon waits on her scene until the player clicks
   * through it; without, the lines go over the radio while play goes on.
   */
  public startTalk(lines: TalkLine[], hold: boolean): void {
    for (const line of lines) {
      if (hold) this.talkQueue.push({ sender: line.who, text: line.text, mood: line.mood ?? 'ngobrol' });
      else this.showRadio(line.who, line.text, line.mood ?? 'ngobrol');
      this.handlers.voice?.prefetch(line.who, line.mood);
    }
  }

  public isTalking(): boolean {
    return this.talkActive;
  }

  /** A click, a tap, Space or Enter: the rest of the line at once, or the next line. */
  public advanceTalk(): void {
    if (!this.talkActive) return;
    if (this.talkSpeech.typing) {
      this.talkSpeech.finish();
      return;
    }
    this.talkSpeech.stop(false);
    this.handlers.onUiClick?.();
    this.nextTalkLine();
  }

  /** Escape: the whole scene is over. */
  public skipTalk(): void {
    if (!this.talkActive) return;
    this.talkQueue.length = 0;
    this.handlers.onUiClick?.();
    this.endTalk(true);
  }

  private nextTalkLine(): void {
    const line = this.talkQueue.shift();
    if (!line) {
      this.endTalk(true);
      return;
    }
    this.talkSpeech.start(line.sender, line.text, line.mood);
  }

  private endTalk(click: boolean): void {
    this.talkSpeech.stop(click);
    this.talkActive = false;
    this.talkCard.hideNow();
    this.talkLayer.classList.add('hidden');
    this.handlers.onTalk?.(false);
  }

  private tickTalk(dt: number): void {
    if (!this.talkActive) {
      if (this.talkQueue.length === 0) return;
      // a line on the small radio steps aside and comes back after the scene
      if (this.radioOn) {
        this.radioSpeech.stop(false);
        this.radioQueue.unshift(this.radioOn);
        this.radioOn = null;
      }
      this.radio.hideNow();
      this.talkActive = true;
      this.talkLayer.classList.remove('hidden');
      this.handlers.onTalk?.(true);
      this.nextTalkLine();
      return;
    }
    this.talkSpeech.tick(dt);
    this.talkCard.waiting(!this.talkSpeech.busy);
  }

  private queueNotice(text: string, swatch: UiSwatch, seconds: number): void {
    this.enqueue({ swatch, text, seconds });
  }

  public tick(dt: number): void {
    // in a menu or another tab, lines wait where they are and go on when the player is back
    if (document.hidden || this.hud.classList.contains('hidden')) return;
    this.tickTalk(dt);
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.waveBanner.classList.add('hidden');
    }
    this.tickNotices(dt);
    this.tickRadio(dt);
  }

  private tickNotices(dt: number): void {
    this.messageLeft = Math.max(0, this.messageLeft - dt);
    if (this.messageLeft > 0) return;
    const next = this.messages.shift();
    this.notice.classList.toggle('hidden', !next);
    if (!next) {
      this.notice.textContent = '';
      return;
    }
    this.messageLeft = next.seconds;
    this.notice.dataset.swatch = next.swatch;
    this.notice.textContent = next.text;
  }

  private tickRadio(dt: number): void {
    // Bu Sari's scene has the floor; the radio waits
    if (this.talkActive) return;
    if (this.radioOn) {
      this.radioSpeech.tick(dt);
      if (this.radioSpeech.busy) return;
      this.radioLeft -= dt;
      this.radio.progress(this.radioLeft / this.radioTotal);
      if (this.radioLeft > 0) return;
      this.radioSpeech.stop(true);
      this.radioOn = null;
      this.radio.leave();
    }
    if (this.radio.leaving) return;
    const next = this.radioQueue.shift();
    if (!next) return;
    this.radioSpeech.start(next.sender, next.text, next.mood);
    this.radioOn = next;
    this.radioLeft = this.radioTotal = radioHold(next.text);
  }

  public celebrate(text: string, swatch: UiSwatch = 'green', originEl?: HTMLElement | null): void {
    // in the workshop the news shows over the map and the tool that changed pops; nothing else moves
    if (originEl && !this.upgradeScreen.classList.contains('hidden')) {
      this.showShopToast(text, swatch);
      this.bumpNode(this.selectedNode);
      return;
    }
    this.queueNotice(text, swatch, 2.8);
  }

  public showToast(text: string, swatch: UiSwatch = 'green'): void {
    this.queueNotice(text, swatch, 2.2);
  }

  /** The shore took something: the health bar flinches. */
  public pulseHealth(): void {
    this.hudEcoWrap.classList.remove('is-hurt');
    void this.hudEcoWrap.offsetWidth;
    this.hudEcoWrap.classList.add('is-hurt');
  }

  public updateHud(
    progress: PlayerProgress,
    stats: ComputedStats,
    tod: TimeOfDay,
    energy: number,
    maxEnergy: number,
    comboCount: number,
    bossHpRatio: number | null,
    objective: Objective,
    wave: WaveHudState
  ): void {
    this.currentWave = wave;
    const inRun = wave.cycle !== 'prep';
    const wallet = progress.totalCoinsEarned > 0 || progress.coins > 0 || progress.shopUnlocked;
    const waves = progress.totalWaves > 0 || progress.shopUnlocked;
    this.hudCoinPill.classList.toggle('hidden', !wallet);
    this.hudEnergy.classList.toggle('hidden', !waves);
    this.hudWaveWrap.classList.toggle('hidden', !inRun);
    this.hudPierWrap.classList.toggle('hidden', !inRun);
    this.hudEcoWrap.classList.toggle('hidden', !inRun);
    this.hudTimePill.classList.toggle('hidden', !inRun);
    if (!this.hud.hasAttribute('data-ready')) this.hud.dataset.ready = 'true';
    const exactCoins = Math.floor(progress.coins);
    if (this.displayedCoins < 0 || exactCoins < this.displayedCoins) {
      this.displayedCoins = exactCoins;
    } else if (exactCoins > this.displayedCoins) {
      const remaining = exactCoins - this.displayedCoins;
      this.displayedCoins += remaining <= 2 ? remaining : Math.ceil(remaining * 0.22);
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

    // Day/Night PvZ Wave Bar
    if (inRun) {
      const pct = Math.max(0, Math.min(100, Math.round(wave.progress * 100)));
      const remSec = wave.cycle === 'day'
        ? Math.max(0, Math.ceil(wave.dayDuration - wave.dayTime))
        : Math.max(0, Math.ceil(wave.nightDuration - wave.nightTime));
      const mm = `${Math.floor(remSec / 60)}:${String(remSec % 60).padStart(2, '0')}`;
      const title =
        wave.cycle === 'day'
          ? `HARI ${wave.day} · SIANG`
          : wave.isBossNight
            ? `MALAM ${wave.day} · BADAI MUSON`
            : `MALAM ${wave.day} · SERBUAN`;
      const sub =
        wave.cycle === 'day'
          ? mm
          : wave.isBossNight
            ? `Kapal Induk + ${wave.activePirates} pengawal`
            : `Sisa ${wave.remainingPirates}/${wave.waveTotal} kapal`;
      const swatch: UiSwatch = wave.cycle === 'night' ? (wave.isBossNight ? 'red' : 'purple') : 'blue';
      const fillSwatch: UiSwatch = wave.cycle === 'night' ? 'red' : remSec <= 25 ? 'orange' : 'gold';
      const waveSig = `${title}|${sub}|${pct}|${swatch}|${fillSwatch}`;
      if (waveSig !== this.lastWaveSig) {
        this.lastWaveSig = waveSig;
        this.hudWaveWrap.dataset.swatch = swatch;
        this.hudWaveTitle.textContent = title;
        this.hudWaveSub.textContent = sub;
        this.hudWaveFill.style.width = `${pct}%`;
        this.hudWaveFill.dataset.swatch = fillSwatch;
      }
      const flagsSig = wave.cycle === 'night' ? wave.hugeFlags.map((f) => Math.round(f * 100)).join(',') : '';
      if (flagsSig !== this.lastFlagsSig) {
        this.lastFlagsSig = flagsSig;
        this.hudWaveFlags.innerHTML =
          wave.cycle === 'night'
            ? wave.hugeFlags.map((f) => `<span class="wave-flag" style="left:${Math.min(96, Math.max(8, Math.round(f * 100)))}%"></span>`).join('')
            : '';
      }
    }

    // Pier HP bar
    if (inRun) {
      const pierPct = Math.max(0, Math.min(100, Math.round((wave.pierHp / Math.max(1, wave.maxPierHp)) * 100)));
      const pierSwatch: UiSwatch = pierPct <= 30 ? 'red' : pierPct <= 60 ? 'orange' : 'green';
      const pierSig = `${wave.pierHp}/${wave.maxPierHp}:${pierSwatch}`;
      if (pierSig !== this.lastPierSig) {
        this.lastPierSig = pierSig;
        this.hudPierBar.style.width = `${pierPct}%`;
        this.hudPierBar.dataset.swatch = pierSwatch;
        this.hudPierIcon.dataset.swatch = pierSwatch;
        this.hudPierVal.textContent = `Dermaga ${wave.pierHp}/${wave.maxPierHp}`;
      }
    }

    // Combo chip
    const comboText = comboCount >= 2 ? `${comboCount}` : '';
    if (comboText !== this.lastComboText) {
      this.lastComboText = comboText;
      this.hudComboPill.classList.toggle('hidden', comboText === '');
      this.hudComboVal.textContent = comboText;
    }

    // Energy meter pill
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

    // Coastal health
    if (stats.ecoPercent !== this.lastEcoPct) {
      this.lastEcoPct = stats.ecoPercent;
      const swatch = healthSwatch(stats.pollution);
      this.hudEcoBar.style.width = `${stats.ecoPercent}%`;
      this.hudEcoBar.dataset.swatch = swatch;
      this.hudEcoIcon.dataset.swatch = swatch;
      this.hudEcoPct.textContent = `Pesisir ${stats.ecoPercent}%`;
    }

    // Mother ship
    const showBoss = bossHpRatio !== null;
    if (showBoss !== this.lastBossShown) {
      this.lastBossShown = showBoss;
      this.hudBossPill.classList.toggle('hidden', !showBoss);
    }
    if (showBoss) {
      const pct = Math.max(0, Math.min(100, Math.round(bossHpRatio * 100)));
      if (pct !== this.lastBossPct) {
        this.lastBossPct = pct;
        this.hudBossVal.textContent = `Kapal Induk ${pct}%`;
        this.hudBossBar.style.width = `${pct}%`;
      }
    }

    this.updateShopButton(progress, wave);
    this.updateObjectiveBanner(objective);
  }

  private updateShopButton(progress: PlayerProgress, wave: WaveHudState): void {
    const open = progress.shopUnlocked;
    const locked = wave.shopLocked;
    const guided = open && wave.cycle === 'prep';
    const affordable = open && !locked ? countAffordableUpgrades(progress) : 0;
    const unread = open ? unreadPages(progress).length : 0;
    const sig = `${open}:${locked}:${guided}:${affordable}:${unread}:${wave.canRepair}`;
    if (sig === this.lastShopSig) return;
    this.lastShopSig = sig;

    this.actionStack.classList.toggle('hidden', !open);
    if (!open) return;
    this.btnOpenShop.classList.toggle('is-guided', guided);
    this.btnOpenShop.dataset.swatch = locked ? 'slate' : guided || affordable > 0 || wave.canRepair ? 'gold' : 'purple';
    this.shopBtnIcon.innerHTML = getUiIconSvg(locked ? 'lock' : 'shop');
    this.shopBtnLabel.textContent = locked ? 'Siaga Malam' : 'Bengkel';
    this.btnOpenShop.setAttribute('aria-label', locked ? 'Bengkel tutup saat malam' : 'Bengkel');
    this.btnOpenShop.title = locked ? 'Bengkel buka saat fajar' : 'Bengkel (E)';
    const badgeCount = affordable + (wave.canRepair ? 1 : 0);
    this.shopBadge.classList.toggle('hidden', locked || badgeCount === 0);
    if (!locked && badgeCount > 0) this.shopBadge.textContent = String(badgeCount);

    this.btnOpenJournal.classList.toggle('hidden', false);
    this.journalBadge.classList.toggle('hidden', unread === 0);
    if (unread > 0) this.journalBadge.textContent = String(unread);
  }

  private updateObjectiveBanner(o: Objective): void {
    const key = [o.key, o.title, o.progress, o.sub].join('|');
    if (key === this.lastObjectiveKey) return;
    this.lastObjectiveKey = key;
    this.hudObjective.dataset.swatch = o.swatch;
    if (this.hudObjTitle.textContent !== o.title) this.hudObjTitle.textContent = o.title;
    this.hudObjProgress.textContent = o.progress ?? '';
    this.hudObjSub.textContent = o.sub;
    this.hudObjective.classList.remove('hidden');
  }

  /* ================================================================ workshop */

  public setShopTab(tab: ShopTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.handlers.onTabSwitch?.();
    this.applyShopTabVisuals();
    this.renderActiveTab();
    (tab === 'tree' ? this.tabTree : this.tabJournal).focus({ preventScroll: true });
  }

  private applyShopTabVisuals(): void {
    const tabs: [ShopTab, HTMLButtonElement, HTMLElement, UiSwatch][] = [
      ['tree', this.tabTree, this.panelTree, 'teal'],
      ['journal', this.tabJournal, this.panelJournal, 'blue'],
    ];
    for (const [id, tab, panel, swatch] of tabs) {
      const on = this.activeTab === id;
      panel.classList.toggle('hidden', !on);
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      tab.dataset.swatch = on ? swatch : 'slate';
    }
    this.shopRibbon.dataset.swatch = this.activeTab === 'tree' ? 'teal' : 'blue';
  }

  public renderUpgradeScreen(progress: PlayerProgress, stats: ComputedStats, headline: string, forceTab?: ShopTab, wave?: WaveHudState): void {
    const entering = this.upgradeScreen.classList.contains('hidden');
    this.currentProgress = progress;
    this.currentStats = stats;
    if (wave) this.currentWave = wave;
    this.headline = headline;
    if (entering) this.activeTab = forceTab ?? 'tree';
    else if (forceTab) this.activeTab = forceTab;
    if (entering) {
      this.freshPages.clear();
      this.sawWorkshopTools = false;
      this.journalAnchor = { cerita: null, patroli: null };
      this.selectedNode = this.pickTool(progress);
      this.panToTools = true;
      this.hideShopToast();
    }
    this.applyShopTabVisuals();
    this.renderShopTop();
    this.renderActiveTab();
  }

  private renderShopTop(): void {
    const progress = this.currentProgress!;
    const stats = this.currentStats!;
    const s = progress.story;
    this.upgradeCoins.textContent = Math.floor(progress.coins).toLocaleString('id-ID');
    const pierPct = Math.round((s.pierHp / Math.max(1, s.maxPierHp)) * 100);
    const pierChipSwatch = pierPct <= 35 ? 'red' : pierPct <= 65 ? 'orange' : 'green';
    this.runSummaryChips.innerHTML = [
      `<span class="shop-chip t-stroke-xs">${this.headline}</span>`,
      `<span class="shop-chip chip-${pierChipSwatch} t-stroke-xs num">Dermaga ${Math.round(s.pierHp)}/${Math.round(s.maxPierHp)}</span>`,
      `<span class="shop-chip chip-${healthSwatch(stats.pollution)} t-stroke-xs num">Pesisir ${stats.ecoPercent}%</span>`,
    ].join('');
    this.fitChips();

    const hurt = s.pierHp < s.maxPierHp && s.cycle !== 'night';
    const cost = this.currentWave?.repairCost ?? Math.round(24 + Math.max(0, s.day - 1) * 8);
    const canRepair = hurt && progress.coins >= cost;
    this.btnRepairPier.classList.toggle('hidden', !hurt);
    if (hurt) {
      this.btnRepairPier.disabled = !canRepair;
      this.btnRepairPier.dataset.swatch = canRepair ? 'green' : 'slate';
      this.repairPierLabel.textContent = `Tambal +${REPAIR_HEAL} · ${cost}`;
    }

    const affordable = countAffordableUpgrades(progress);
    this.tabBadgeTree.classList.toggle('hidden', affordable === 0);
    if (affordable > 0) this.tabBadgeTree.textContent = String(affordable);
    this.refreshJournalBadge(progress);
  }

  /** The chips beside the purse show whole or not at all; the chapter goes first. */
  private fitChips(): void {
    const box = this.runSummaryChips;
    const chips = Array.from(box.children) as HTMLElement[];
    for (const chip of chips) chip.hidden = false;
    if (!box.clientWidth && !box.scrollWidth) return;
    for (const chip of chips) {
      if (box.scrollWidth <= box.clientWidth + 1) break;
      chip.hidden = true;
    }
  }

  private refreshJournalBadge(progress: PlayerProgress): void {
    const unread = unreadPages(progress).length;
    this.tabBadgeJournal.classList.toggle('hidden', unread === 0);
    if (unread > 0) this.tabBadgeJournal.textContent = String(unread);
  }

  private renderActiveTab(): void {
    const progress = this.currentProgress;
    if (!progress) return;
    if (this.activeTab === 'tree') {
      this.renderTree(progress);
      this.renderInspector(progress);
    } else this.renderJournal(progress);
  }

  /** Everything in the workshop that depends on its size, measured again. */
  private layoutShop(): void {
    if (this.upgradeScreen.classList.contains('hidden') || !this.currentProgress) return;
    this.fitChips();
    if (this.activeTab === 'tree') {
      this.layoutTree();
      this.fitPanel();
    } else this.layoutJournal();
  }

  private bindWorkshopEvents(): void {
    // one size pass per frame, whichever part changed size
    const resize = new ResizeObserver(() => this.layoutShop());
    for (const part of [this.treeMap, this.toolPanel, this.journalBook, this.runSummaryChips.parentElement!]) resize.observe(part);

    this.treeNodes.addEventListener('click', (event) => {
      const node = (event.target as HTMLElement).closest<HTMLElement>('[data-node]');
      if (node) this.selectTool(node.dataset.node as UpgradeId);
    });
    // arrows walk the map to the nearest tool in that direction, and the map follows the keyboard
    this.treeNodes.addEventListener('keydown', (event) => {
      const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const dir = step[event.key];
      const from = (event.target as HTMLElement).closest<HTMLElement>('[data-node]');
      if (!dir || !from) return;
      event.preventDefault();
      const next = this.nearestTool(from.dataset.node as UpgradeId, dir[0], dir[1]);
      if (next) this.selectTool(next, true);
    });
    this.treeNodes.addEventListener('focusin', (event) => {
      const node = (event.target as HTMLElement).closest<HTMLElement>('[data-node]');
      if (node?.matches(':focus-visible')) this.revealTool(node.dataset.node as UpgradeId);
    });
    this.bindMapPan();

    this.journalPrev.addEventListener('click', () => this.flipJournal(-1));
    this.journalNext.addEventListener('click', () => this.flipJournal(1));
    // the wheel and a swipe turn pages, since there is nothing to scroll
    this.journalBook.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const now = performance.now();
        if (now - this.journalWheelAt < 420) return;
        this.journalWheel += event.deltaY + event.deltaX;
        if (Math.abs(this.journalWheel) < 40) return;
        const dir = Math.sign(this.journalWheel);
        this.journalWheel = 0;
        this.journalWheelAt = now;
        this.flipJournal(dir);
      },
      { passive: false }
    );
    let swipe: { id: number; x: number; y: number } | null = null;
    this.journalBook.addEventListener('pointerdown', (event) => {
      swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    this.journalBook.addEventListener('pointerup', (event) => {
      if (!swipe || swipe.id !== event.pointerId) return;
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.2) this.flipJournal(dx < 0 ? 1 : -1);
      else if (Math.abs(dy) > 44 && Math.abs(dy) > Math.abs(dx) * 1.2) this.flipJournal(dy < 0 ? 1 : -1);
    });
    this.journalBook.addEventListener('pointercancel', () => {
      swipe = null;
    });
  }

  /**
   * A map larger than its window is moved by dragging it (mouse or finger) or with the wheel. A drag
   * that ends on a tool does not pick it, and nothing else moves the map while the workshop is open,
   * except the keyboard bringing a tool into view.
   */
  private bindMapPan(): void {
    const map = this.treeMap;
    let drag: { id: number; x: number; y: number; px: number; py: number; moved: boolean } | null = null;
    map.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !map.classList.contains('can-pan')) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, px: this.pan.x, py: this.pan.y, moved: false };
    });
    map.addEventListener('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const s = layoutScale(map);
      const dx = (event.clientX - drag.x) / s;
      const dy = (event.clientY - drag.y) / s;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 6) return;
        drag.moved = true;
        map.setPointerCapture(event.pointerId);
        map.classList.add('is-dragging');
      }
      this.setPan(drag.px + dx, drag.py + dy);
    });
    const end = (event: PointerEvent): void => {
      if (!drag || drag.id !== event.pointerId) return;
      if (drag.moved) {
        this.panDragged = true;
        window.setTimeout(() => (this.panDragged = false), 0);
      }
      map.classList.remove('is-dragging');
      drag = null;
    };
    map.addEventListener('pointerup', end);
    map.addEventListener('pointercancel', end);
    map.addEventListener(
      'click',
      (event) => {
        if (!this.panDragged) return;
        event.stopPropagation();
        event.preventDefault();
      },
      true
    );
    map.addEventListener(
      'wheel',
      (event) => {
        if (!map.classList.contains('can-pan')) return;
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? map.clientHeight : 1;
        let dx = event.deltaX * unit;
        let dy = event.deltaY * unit;
        // a plain wheel moves sideways when the map only runs wide
        if ((event.shiftKey || !this.panAxes.y) && dx === 0) [dx, dy] = [dy, 0];
        this.setPan(this.pan.x - dx, this.pan.y - dy);
      },
      { passive: false }
    );
  }

  /** Keys the workshop answers besides its buttons: page keys and arrows turn the journal's pages. */
  public handleShopKey(event: KeyboardEvent): boolean {
    if (this.activeTab !== 'journal' || this.upgradeScreen.classList.contains('hidden')) return false;
    if ((event.target as HTMLElement | null)?.closest?.('[role="tablist"]')) return false;
    if (event.key === 'PageDown' || event.key === 'ArrowRight' || event.key === 'ArrowDown') return this.flipJournal(1) || true;
    if (event.key === 'PageUp' || event.key === 'ArrowLeft' || event.key === 'ArrowUp') return this.flipJournal(-1) || true;
    return false;
  }

  private isIntro(progress: PlayerProgress): boolean {
    return progress.story.marks.workshopVisit === undefined;
  }

  private pickTool(progress: PlayerProgress): UpgradeId {
    if (this.isIntro(progress) && this.nodeShown('wave_width', progress)) return 'wave_width';
    if (this.selectedNode !== 'core' && this.nodeShown(this.selectedNode, progress)) return this.selectedNode;
    const shown = UPGRADE_DEFS.filter((d) => d.id !== 'core' && this.nodeShown(d.id, progress));
    return (shown.find((d) => this.nodeState(d.id, progress).canBuy) ?? shown[0])?.id ?? 'core';
  }

  private nodeShown(id: UpgradeId, progress: PlayerProgress): boolean {
    if (id === 'core') return true;
    return isUpgradeShown(id, progress);
  }

  private nodeState(id: UpgradeId, progress: PlayerProgress) {
    const def = UPGRADE_MAP[id];
    const lv = progress.upgrades[id] ?? 0;
    const cost = getUpgradeCost(id, lv);
    const forSale = isForSale(id, progress);
    return { def, lv, cost, maxed: lv >= def.maxLevel, forSale, canBuy: forSale && progress.coins >= cost };
  }

  /** Updates the buttons on the map in place: a purchase changes their marks, never their places or focus. */
  private renderTree(progress: PlayerProgress): void {
    this.sawWorkshopTools = true;
    if (!this.nodeShown(this.selectedNode, progress)) this.selectedNode = this.pickTool(progress);
    const intro = this.isIntro(progress);
    const boughtAny = UPGRADE_DEFS.some((d) => d.id !== 'core' && (progress.upgrades[d.id] ?? 0) > 0);
    const shown = new Set(UPGRADE_DEFS.filter((d) => this.nodeShown(d.id, progress)).map((d) => d.id));
    for (const [id, btn] of this.nodeEls) {
      if (shown.has(id)) continue;
      btn.remove();
      this.nodeEls.delete(id);
    }
    UPGRADE_DEFS.forEach((def, i) => {
      if (!shown.has(def.id)) return;
      let btn = this.nodeEls.get(def.id);
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.node = def.id;
        btn.dataset.swatch = def.cardSwatch;
        btn.setAttribute('aria-controls', 'tool-panel');
        btn.innerHTML = `
          <span class="tree-node-lv t-stroke-xs num"></span>
          ${getUiIconSvg(def.icon, 'tree-node-icon')}
          <span class="tree-node-label t-stroke-xs">${def.shortName}</span>
        `;
        // tab order follows the list of tools, whatever order they arrived in
        const after = UPGRADE_DEFS.slice(i + 1).map((d) => this.nodeEls.get(d.id)).find(Boolean) ?? null;
        this.treeNodes.insertBefore(btn, after);
        this.nodeEls.set(def.id, btn);
      }
      const st = this.nodeState(def.id, progress);
      const badge =
        def.id === 'core'
          ? 'INTI'
          : st.maxed
            ? 'MAKS'
            : `${st.lv}/${def.maxLevel}`;
      const selected = def.id === this.selectedNode;
      btn.classList.toggle('tree-node', true);
      btn.classList.toggle('owned', st.lv > 0);
      btn.classList.toggle('maxed', st.maxed);
      btn.classList.toggle('affordable', st.canBuy);
      btn.classList.toggle('is-selected', selected);
      btn.classList.toggle('is-guided', intro && !boughtAny && (def.id === 'wave_width' || def.id === 'trash_density'));
      btn.setAttribute('aria-pressed', String(selected));
      btn.setAttribute('aria-label', `${def.name}, ${badge}`);
      btn.querySelector('.tree-node-lv')!.textContent = st.maxed ? '✓' : badge;
    });
    this.layoutTree();
  }

  private selectTool(id: UpgradeId, focus = false): void {
    const progress = this.currentProgress;
    if (!progress || !this.nodeShown(id, progress)) return;
    this.handlers.onUiClick?.();
    this.selectedNode = id;
    for (const [nodeId, btn] of this.nodeEls) {
      const on = nodeId === id;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-pressed', String(on));
    }
    this.renderInspector(progress);
    if (focus) this.nodeEls.get(id)?.focus({ preventScroll: true });
  }

  /** The closest tool from `from` in a direction, favouring the straight line over the diagonal. */
  private nearestTool(from: UpgradeId, dx: number, dy: number): UpgradeId | null {
    const a = this.nodeAt.get(from);
    if (!a) return null;
    let best: UpgradeId | null = null;
    let bestScore = Infinity;
    for (const id of this.nodeEls.keys()) {
      const b = this.nodeAt.get(id);
      if (!b || id === from) continue;
      const along = (b.x - a.x) * dx + (b.y - a.y) * dy;
      if (along <= 4) continue;
      const across = Math.abs((b.x - a.x) * dy - (b.y - a.y) * dx);
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = id;
      }
    }
    return best;
  }

  /**
   * Places the tools on the map at this size. The map is a 7 by 4 grid and every tool owns a cell, so a
   * tool that appears or levels up never moves another one. Tools keep one shape and grow with the map;
   * when the map is too small for names that still read, the grid stays at that size and the map pans.
   */
  private layoutTree(): void {
    const map = this.treeMap;
    const W = map.clientWidth;
    const H = map.clientHeight;
    if (W < 40 || H < 40) return;
    const perPx = this.labelWidth(1);
    // the level tag on the corner, the selection ring and the shadow need this much room at the edge
    const padFor = (h: number): number => Math.max(h * 0.19, 13 + h * NODE_RATIO * 0.04) + 6;
    const hMin = Math.max(NODE_MIN_FONT / 0.17, (NODE_MIN_FONT * perPx + 8) / NODE_RATIO);
    const fitW = (W - 2 * padFor(NODE_MAX_H)) / (MAP_COLS * NODE_RATIO + (MAP_COLS - 1) * GAP_X[0]);
    const fitH = (H - 2 * padFor(NODE_MAX_H)) / (MAP_ROWS + (MAP_ROWS - 1) * GAP_Y[0]);
    const h = Math.min(NODE_MAX_H, Math.max(hMin, Math.min(fitW, fitH)));
    const w = h * NODE_RATIO;
    const font = Math.min(13.5, h * 0.17, (w - 8) / perPx);
    const pad = padFor(h);
    const spread = (room: number, n: number, size: number, [lo, hi]: [number, number]): number =>
      Math.min(hi * h, Math.max(lo * h, (room - 2 * pad - n * size) / (n - 1)));
    const gapX = spread(W, MAP_COLS, w, GAP_X);
    const gapY = spread(H, MAP_ROWS, h, GAP_Y);
    const cw = 2 * pad + MAP_COLS * w + (MAP_COLS - 1) * gapX;
    const ch = 2 * pad + MAP_ROWS * h + (MAP_ROWS - 1) * gapY;

    map.style.setProperty('--node-w', `${w.toFixed(1)}px`);
    map.style.setProperty('--node-h', `${h.toFixed(1)}px`);
    map.style.setProperty('--node-font', `${font.toFixed(2)}px`);
    map.style.setProperty('--node-icon', `${(h * 0.4).toFixed(1)}px`);
    // the drifting grid underneath is a square that covers the map at its tilt
    map.style.setProperty('--grid-size', `${Math.ceil(Math.hypot(W, H) + 160)}px`);
    this.treeCanvas.style.width = `${cw.toFixed(1)}px`;
    this.treeCanvas.style.height = `${ch.toFixed(1)}px`;

    for (const def of UPGRADE_DEFS) {
      this.nodeAt.set(def.id, { x: pad + w / 2 + def.col * (w + gapX), y: pad + h / 2 + def.row * (h + gapY) });
    }
    for (const [id, btn] of this.nodeEls) {
      const p = this.nodeAt.get(id)!;
      btn.style.left = `${p.x.toFixed(1)}px`;
      btn.style.top = `${p.y.toFixed(1)}px`;
    }
    const was = this.treeGeom;
    const resized = was.vw !== W || was.vh !== H || was.cw !== cw || was.ch !== ch;
    this.treeGeom = { w, h, gapX, pad, cw, ch, vw: W, vh: H };
    if (this.panToTools || resized) this.aimMap();
    else this.setPan(this.pan.x, this.pan.y);
    this.panToTools = false;
    this.drawLinks();
  }

  /** The part of the canvas the tools on show cover, with room for their tags and rings. */
  private toolBounds(): { l: number; r: number; t: number; b: number } {
    const g = this.treeGeom;
    const box = { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity };
    for (const id of this.nodeEls.keys()) {
      const p = this.nodeAt.get(id)!;
      box.l = Math.min(box.l, p.x - g.w / 2 - g.pad);
      box.r = Math.max(box.r, p.x + g.w / 2 + g.pad);
      box.t = Math.min(box.t, p.y - g.h / 2 - g.pad);
      box.b = Math.max(box.b, p.y + g.h / 2 + g.pad);
    }
    return box;
  }

  /** Opening view: all the tools on show when they fit, else the picked tool in the middle. */
  private aimMap(): void {
    const g = this.treeGeom;
    const box = this.toolBounds();
    const picked = this.nodeAt.get(this.selectedNode);
    const cx = box.r - box.l <= g.vw || !picked ? (box.l + box.r) / 2 : picked.x;
    const cy = box.b - box.t <= g.vh || !picked ? (box.t + box.b) / 2 : picked.y;
    this.setPan(g.vw / 2 - cx, g.vh / 2 - cy, true);
  }

  /**
   * Moves the canvas. A grid that fits the map sits centred and still. Otherwise the canvas goes only as
   * far as the tools on show reach, and holds still when they all fit. The place it is at stays allowed
   * until the player leaves it, so a tool appearing after a purchase never shifts the map; `aim` sets a
   * new place outright, on opening or resizing.
   */
  private setPan(x: number, y: number, aim = false): void {
    const g = this.treeGeom;
    const box = this.toolBounds();
    const axis = (want: number, now: number, view: number, size: number, lo: number, hi: number): [number, boolean] => {
      if (size <= view) return [(view - size) / 2, false];
      let min: number;
      let max: number;
      if (hi - lo > view) {
        min = view - hi;
        max = -lo;
      } else {
        min = max = view / 2 - (lo + hi) / 2;
      }
      if (!aim) {
        min = Math.min(min, now);
        max = Math.max(max, now);
      }
      return [Math.min(max, Math.max(min, want)), max - min > 0.5];
    };
    const [px, panX] = axis(x, this.pan.x, g.vw, g.cw, box.l, box.r);
    const [py, panY] = axis(y, this.pan.y, g.vh, g.ch, box.t, box.b);
    this.pan = { x: px, y: py };
    this.panAxes = { x: panX, y: panY };
    this.treeCanvas.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
    const map = this.treeMap;
    map.classList.toggle('can-pan', panX || panY);
    // a soft edge with an arrow on every side that has part of a tool behind it, not just its margin
    const inset = g.pad / 2;
    map.classList.toggle('more-l', box.l + inset + px < -0.5);
    map.classList.toggle('more-r', box.r - inset + px > g.vw + 0.5);
    map.classList.toggle('more-t', box.t + inset + py < -0.5);
    map.classList.toggle('more-b', box.b - inset + py > g.vh + 0.5);
  }

  /** Glides the map just far enough to show a tool reached with the keyboard. */
  private revealTool(id: UpgradeId): void {
    const p = this.nodeAt.get(id);
    const g = this.treeGeom;
    if (!p || !this.treeMap.classList.contains('can-pan')) return;
    const mx = g.w / 2 + g.pad;
    const my = g.h / 2 + g.pad;
    const x = Math.min(Math.max(this.pan.x, mx - p.x), g.vw - mx - p.x);
    const y = Math.min(Math.max(this.pan.y, my - p.y), g.vh - my - p.y);
    if (Math.abs(x - this.pan.x) < 0.5 && Math.abs(y - this.pan.y) < 0.5) return;
    this.treeCanvas.classList.add('is-gliding');
    window.clearTimeout(this.panGlideTimer);
    this.panGlideTimer = window.setTimeout(() => this.treeCanvas.classList.remove('is-gliding'), 320);
    this.setPan(x, y);
  }

  /**
   * Paths leave A.L.U.N. sideways, run along a shared trunk and branch off at right angles into each
   * tool, so every route reads outward from the core. A route that is installed glows in its branch's
   * colour and carries small lights moving away from the core.
   */
  private drawLinks(): void {
    const progress = this.currentProgress;
    if (!progress) return;
    const g = this.treeGeom;
    const svg = this.treeLinks;
    svg.setAttribute('viewBox', `0 0 ${g.cw.toFixed(1)} ${g.ch.toFixed(1)}`);
    svg.setAttribute('width', g.cw.toFixed(1));
    svg.setAttribute('height', g.ch.toFixed(1));
    const lw = Math.max(3, Math.min(5.5, g.h * 0.066));
    svg.style.setProperty('--link-w', `${lw.toFixed(2)}px`);
    svg.style.setProperty('--flow-gap', `${(lw * 5.5).toFixed(1)}px`);
    const radius = Math.max(2, Math.min(12, g.gapX / 2 - 1, g.h * 0.16));
    const outlines: string[] = [];
    const quiet: string[] = [];
    const lit: string[] = [];
    const flows: string[] = [];
    for (const id of this.nodeEls.keys()) {
      for (const reqId of UPGRADE_MAP[id].requires) {
        if (!this.nodeEls.has(reqId)) continue;
        const d = this.linkPath(reqId, id, radius);
        const st = this.nodeState(id, progress);
        const on = st.lv > 0 || st.maxed;
        const branch = reqId === 'core' ? 'core' : UPGRADE_MAP[id].branch;
        outlines.push(`<path class="tree-link-outline" d="${d}"/>`);
        (on ? lit : quiet).push(`<path class="tree-link ${on ? 'link-on' : 'link-open'} branch-${branch}" d="${d}"/>`);
        if (on) flows.push(`<path class="tree-link-flow" d="${d}"/>`);
      }
    }
    // the lit routes go on top, so a trunk shared with a lit route shows lit
    svg.innerHTML = outlines.join('') + quiet.join('') + lit.join('') + flows.join('');
  }

  /** Side of `from` to side of `to`, turning at the middle of the gap between their columns. */
  private linkPath(from: UpgradeId, to: UpgradeId, radius: number): string {
    const a = this.nodeAt.get(from)!;
    const b = this.nodeAt.get(to)!;
    const { w, h } = this.treeGeom;
    const f = (v: number): string => v.toFixed(1);
    if (Math.abs(a.x - b.x) < 1) {
      const s = Math.sign(b.y - a.y);
      return `M ${f(a.x)} ${f(a.y + (s * h) / 2)} V ${f(b.y - (s * h) / 2)}`;
    }
    const s = Math.sign(b.x - a.x);
    const x0 = a.x + (s * w) / 2;
    const x1 = b.x - (s * w) / 2;
    if (Math.abs(a.y - b.y) < 1) return `M ${f(x0)} ${f(a.y)} H ${f(x1)}`;
    const mx = (x0 + x1) / 2;
    const t = Math.sign(b.y - a.y);
    const r = Math.min(radius, Math.abs(mx - x0), Math.abs(b.y - a.y) / 2);
    return (
      `M ${f(x0)} ${f(a.y)} H ${f(mx - s * r)} Q ${f(mx)} ${f(a.y)} ${f(mx)} ${f(a.y + t * r)} ` +
      `V ${f(b.y - t * r)} Q ${f(mx)} ${f(b.y)} ${f(mx + s * r)} ${f(b.y)} H ${f(x1)}`
    );
  }

  private labelCtx = document.createElement('canvas').getContext('2d');
  private labelWidth(font: number): number {
    const ctx = this.labelCtx;
    if (!ctx) return font * 6.6;
    ctx.font = `700 ${font}px Fredoka, Nunito, sans-serif`;
    let widest = 0;
    for (const def of UPGRADE_DEFS) widest = Math.max(widest, ctx.measureText(def.shortName).width);
    return widest + font * 0.35;
  }

  private bumpNode(id: UpgradeId): void {
    const btn = this.nodeEls.get(id);
    if (!btn) return;
    btn.classList.remove('is-bumped');
    void btn.offsetWidth;
    btn.classList.add('is-bumped');
  }

  /** The news pops up beside the tool that changed, inside the map, then fades; it covers nothing for long. */
  private showShopToast(text: string, swatch: UiSwatch): void {
    const toast = this.shopToast;
    toast.textContent = text;
    toast.dataset.swatch = swatch;
    toast.classList.remove('is-on');
    const node = this.nodeEls.get(this.selectedNode);
    const map = this.treeMap;
    if (node && map.clientWidth) {
      const s = layoutScale(map);
      const m = map.getBoundingClientRect();
      const n = node.getBoundingClientRect();
      const w = toast.offsetWidth;
      const h = toast.offsetHeight;
      // above the tool, or under it when the tool sits on the top row; never past the map's edges
      const cx = (n.left + n.width / 2 - m.left) / s;
      const x = Math.min(Math.max(cx, w / 2 + 6), map.clientWidth - w / 2 - 6);
      let y = (n.top - m.top) / s - h - 8;
      if (y < 6) y = (n.bottom - m.top) / s + 8;
      toast.style.left = `${x}px`;
      toast.style.top = `${Math.max(6, Math.min(y, map.clientHeight - h - 6))}px`;
    } else {
      toast.style.left = '';
      toast.style.top = '';
    }
    void toast.offsetWidth;
    toast.classList.add('is-on');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => toast.classList.remove('is-on'), 2600);
  }

  private hideShopToast(): void {
    window.clearTimeout(this.toastTimer);
    this.shopToast.classList.remove('is-on');
  }

  /** The first visit's guidance, in the words of the workshop tutorial. */
  private introNote(progress: PlayerProgress): string {
    const boughtAny = UPGRADE_DEFS.some((d) => d.id !== 'core' && (progress.upgrades[d.id] ?? 0) > 0);
    if (boughtAny) {
      return progress.story.cycle === 'prep'
        ? 'Alat pertamamu sudah terpasang! Tekan "Mulai Hari 1" di bawah untuk kembali ke laguna.'
        : 'Alat sudah terpasang. Kamu bisa kembali ke laguna dan mencoba kekuatannya!';
    }
    const widthCost = getUpgradeCost('wave_width', 0);
    const densityCost = getUpgradeCost('trash_density', 0);
    return progress.coins >= Math.min(widthCost, densityCost)
      ? `Pasang alat pertamamu — Bentang (${widthCost}) untuk ombak lebar atau Muatan (${densityCost}) agar rongsok makin melimpah!`
      : `Kumpulkan koin di laguna untuk memasang Bentang (${widthCost}) atau Muatan (${densityCost}).`;
  }

  /** The picked tool. Its button sits at the foot of the panel whatever the tool, the text above it fits itself. */
  private renderInspector(progress: PlayerProgress): void {
    const st = this.nodeState(this.selectedNode, progress);
    const def = st.def;
    const core = def.id === 'core';

    this.inspHeaderCard.dataset.swatch = BRANCH_SWATCH[def.branch];
    this.inspBranch.textContent = BRANCH_LABELS[def.branch];
    this.inspIcon.innerHTML = getUiIconSvg(def.icon);
    this.inspTitle.textContent = def.name;
    this.inspDesc.textContent = def.description;
    this.inspPips.innerHTML = core
      ? ''
      : Array.from({ length: def.maxLevel }, (_, i) => getUiIconSvg(i < st.lv ? 'star_on' : 'star_off', 'insp-pip')).join('');
    this.inspPips.hidden = core;

    const row = (label: string, value: string, warn = false): string =>
      `<div class="insp-row${warn ? ' req-warn' : ''}"><span>${label}</span><strong class="num">${value}</strong></div>`;
    let rows: string;
    if (core) {
      rows = row(def.statLabel, def.statBefore(1)) + row('Efek', def.effectText(1));
    } else {
      const delta = st.maxed || !st.forSale ? def.statBefore(st.lv) : `${def.statBefore(st.lv)} ➜ ${def.statAfter(st.lv)}`;
      rows = row(def.statLabel, delta) + row('Efek', def.effectText(st.lv));
      if (st.forSale && !st.canBuy) rows += row('Harga', `${st.cost.toLocaleString('id-ID')} koin`, true);
    }
    this.inspStats.innerHTML = rows;

    const intro = this.isIntro(progress);
    const supply = nextSupply(progress.story.flags);
    const note = intro
      ? this.introNote(progress)
      : supply && !st.maxed && !st.forSale
        ? supply
        : '';
    this.toolNote.textContent = note;
    this.toolNote.hidden = note === '';
    this.btnReturn.classList.toggle('hidden', !intro);
    const returnLabel = this.btnReturn.querySelector('span:last-child');
    if (returnLabel) {
      returnLabel.textContent = progress.story.cycle === 'prep' ? 'Mulai Hari 1' : 'Kembali ke laguna';
    }

    let swatch: UiSwatch = 'slate';
    let icon: UiIconName = 'coin';
    let label: string;
    let enabled = false;
    if (core) {
      swatch = 'teal';
      icon = 'check';
      label = 'Selalu aktif';
    } else if (st.maxed) {
      swatch = 'gold';
      icon = 'check';
      label = 'Sudah maksimal';
    } else if (!st.forSale) {
      icon = 'lock';
      label = 'Buka cabang dulu';
    } else if (st.canBuy) {
      swatch = 'green';
      label = `${st.lv === 0 ? 'Pasang' : 'Tingkatkan'} · ${st.cost.toLocaleString('id-ID')}`;
      enabled = true;
    } else {
      label = `Kurang ${Math.ceil(st.cost - progress.coins).toLocaleString('id-ID')} koin`;
    }
    const btn = this.btnBuyNode;
    btn.disabled = !enabled;
    btn.dataset.swatch = swatch;
    btn.innerHTML = `${getUiIconSvg(icon, 'ui-btn-icon')}<span class="num">${label}</span>`;
    this.fitPanel();
  }

  /** Steps the panel down until all it shows is whole; the buttons keep their size and place throughout. */
  private fitPanel(): void {
    const panel = this.toolPanel;
    if (!panel.clientHeight) return;
    // the description only gives way to a note that says what to do
    const steps = this.toolNote.hidden ? PANEL_FIT.filter((s) => s.desc !== false) : PANEL_FIT;
    let level = 0;
    for (; level < steps.length; level++) {
      const s = steps[level];
      panel.style.setProperty('--k', String(s.k));
      panel.classList.toggle('no-pips', s.pips === false);
      panel.classList.toggle('no-desc', s.desc === false);
      if (this.panelFits()) break;
    }
    panel.dataset.fit = String(Math.min(level, steps.length - 1));
    fitLine(this.btnBuyNode, true);
    fitLine(this.btnReturn);
  }

  /** True when the foot of the panel ends inside it: with the foot pushed down, the buttons would move. */
  private panelFits(): boolean {
    const panel = this.toolPanel;
    const cs = getComputedStyle(panel);
    // the padding is in layout pixels and the boxes in screen pixels; they differ while the modal zooms in
    const pad = (parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth)) * layoutScale(panel);
    const floor = panel.getBoundingClientRect().bottom - pad;
    return this.toolBottom.getBoundingClientRect().bottom <= floor + 0.05 && panel.scrollWidth <= panel.clientWidth + 1;
  }

  private renderJournal(progress: PlayerProgress): void {
    const unread = unreadPages(progress, this.activePart);
    for (const e of unread) this.freshPages.add(e.id);
    // The open section's badges clear while its stamps stay visible for this visit.
    if (unread.length > 0) this.handlers.onReadJournal(this.activePart);
    const badge = (node: HTMLElement, part: JournalEntry['part']): void => {
      const n = unreadPages(progress, part).length;
      node.classList.toggle('hidden', n === 0);
      if (n > 0) node.textContent = String(n);
    };
    badge(this.journalBadge1, 'cerita');
    badge(this.journalBadge2, 'patroli');

    const story = this.activePart === 'cerita';
    this.journalPart1.setAttribute('aria-selected', String(story));
    this.journalPart2.setAttribute('aria-selected', String(!story));
    this.journalPart1.tabIndex = story ? 0 : -1;
    this.journalPart2.tabIndex = story ? -1 : 0;
    this.journalBook.setAttribute('aria-labelledby', story ? this.journalPart1.id : this.journalPart2.id);

    const list = JOURNAL.filter((e) => e.part === this.activePart);
    if (this.journalAnchor[this.activePart] === null) {
      const fresh = list.findIndex((e) => this.freshPages.has(e.id));
      const open = list.findIndex((e) => !isWritten(e, progress));
      // The lagoon section opens at its ledger when there is no new entry.
      this.journalAnchor[this.activePart] = story ? Math.max(0, fresh >= 0 ? fresh : open) : fresh + 1;
    }

    this.journalLeaves = list.map((e) => {
      const written = isWritten(e, progress);
      return renderJournalEntry({
        date: e.date,
        title: e.title,
        text: written ? e.note : e.hint,
        swatch: e.swatch,
        icon: e.icon,
        written,
        fresh: this.freshPages.has(e.id),
        tally: e.tally && { ...e.tally, current: e.value(progress), target: e.target },
      });
    });
    if (!story) {
      const s = progress.story;
      const bestDay = Math.max(s.day, loadBest(browserStore()).bestDay);
      this.journalLeaves.unshift(renderJournalRecord(s.day, [
        { label: 'Malam terlewati', value: s.nightsSurvived.toLocaleString('id-ID') },
        { label: 'Kapal dihalau', value: s.piratesSunk.toLocaleString('id-ID') },
        { label: 'Rongsok terangkat', value: progress.totalTrash.toLocaleString('id-ID') },
        { label: 'Hari terjauh', value: `Hari ${bestDay.toLocaleString('id-ID')}` },
      ]));
    }
    this.layoutJournal();
    this.refreshJournalBadge(progress);
  }

  /** Turn one leaf on small screens and a spread on wide screens. */
  private layoutJournal(): void {
    const book = this.journalBook;
    const total = this.journalLeaves.length;
    if (!book.clientWidth || !total) return;
    const perPage = getComputedStyle(book).getPropertyValue('--journal-leaves').trim() === '2' ? 2 : 1;
    const pages = Math.ceil(total / perPage);
    const page = Math.min(pages - 1, Math.floor((this.journalAnchor[this.activePart] ?? 0) / perPage));
    this.journalPerPage = perPage;
    this.journalPages = pages;
    this.journalPageIndex = page;

    const first = page * perPage;
    const end = Math.min(first + perPage, total);
    const leaves = this.journalLeaves.slice(first, end);
    const range = leaves.length === 1 ? String(first + 1) : `${first + 1}–${end}`;
    if (leaves.length < perPage) leaves.push('<div class="journal-leaf journal-empty" aria-hidden="true"></div>');
    this.journalSpread.innerHTML = leaves.join('');
    const label = `${range} / ${total}`;
    if (this.journalPageLabel.textContent !== label) this.journalPageLabel.textContent = label;
    this.journalPrev.disabled = page === 0;
    this.journalNext.disabled = page >= pages - 1;
  }

  /** Turns the journal one page; false when there is no page that way. */
  public flipJournal(delta: number): boolean {
    if (this.activeTab !== 'journal' || this.upgradeScreen.classList.contains('hidden')) return false;
    const next = this.journalPageIndex + delta;
    if (next < 0 || next >= this.journalPages) return false;
    this.journalAnchor[this.activePart] = next * this.journalPerPage;
    this.handlers.onTabSwitch?.();
    this.layoutJournal();
    return true;
  }

  public renderVictory(progress: PlayerProgress): void {
    const s = progress.story;
    const minutes = Math.floor(s.clock / 60);
    const seconds = Math.floor(s.clock % 60);
    this.victoryStats.innerHTML = [
      renderStatTile('Waktu bermain', `${minutes}:${String(seconds).padStart(2, '0')}`, 'sun', 'blue'),
      renderStatTile('Bajak laut dihalau', s.piratesSunk.toLocaleString('id-ID'), 'raider', 'red'),
      renderStatTile('Rongsok terangkat', progress.totalTrash.toLocaleString('id-ID'), 'net', 'green'),
      renderStatTile('Resonansi terpicu', progress.totalResonances.toLocaleString('id-ID'), 'resonance', 'purple'),
      renderStatTile('HP Dermaga', `${Math.round(s.pierHp)}/${Math.round(s.maxPierHp)}`, 'shield', 'teal'),
      renderStatTile('Koin terkumpul', progress.totalCoinsEarned.toLocaleString('id-ID'), 'coin', 'gold'),
    ].join('');
    spawnUiConfetti(null, 42);
  }

  public renderDefeat(progress: PlayerProgress, best: BestRecord): void {
    const s = progress.story;
    const when = s.cycle === 'night' ? `MALAM ${s.day}` : `HARI ${s.day}`;
    this.defeatSub.textContent = `${when} · ${dayTitle(s.day).toUpperCase()} — REKOR TERBAIK: HARI ${best.bestDay}`;
    this.defeatStats.innerHTML = [
      renderStatTile('Bertahan hingga', `Hari ${s.day}`, 'moon', 'purple'),
      renderStatTile('Malam dilewati', `${s.nightsSurvived} malam`, 'trophy', 'gold'),
      renderStatTile('Bajak laut dihalau', s.piratesSunk.toLocaleString('id-ID'), 'raider', 'red'),
      renderStatTile('Rongsok terangkat', progress.totalTrash.toLocaleString('id-ID'), 'net', 'green'),
      renderStatTile('Resonansi terpicu', progress.totalResonances.toLocaleString('id-ID'), 'resonance', 'teal'),
      renderStatTile('Total koin', progress.totalCoinsEarned.toLocaleString('id-ID'), 'coin', 'orange'),
    ].join('');
  }
}

/** Green while the coast is healthy, then orange, then red: the same three bands the lagoon shows. */
function healthSwatch(p: number): 'green' | 'orange' | 'red' {
  return p >= P_DIRTY ? 'red' : p >= P_HEALTHY ? 'orange' : 'green';
}
