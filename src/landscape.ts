const touchScreen = '(pointer: coarse)';

interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
}

interface WebkitElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

let zoomLocked = false;

/** Blocks pinch-zoom, iOS Safari gestures, double-tap zoom, ctrl+wheel zoom, and keyboard zoom shortcuts. */
function lockZoom(): void {
  if (zoomLocked) return;
  zoomLocked = true;
  const prevent = (e: Event): void => {
    e.preventDefault();
  };
  document.addEventListener('gesturestart', prevent, { passive: false });
  document.addEventListener('gesturechange', prevent, { passive: false });
  document.addEventListener('gestureend', prevent, { passive: false });
  document.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );
  document.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );
  document.addEventListener('dblclick', prevent, { passive: false });
  window.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false }
  );
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
      e.preventDefault();
    }
  });
}

export class LandscapeMode {
  private readonly orientation = screen.orientation as (ScreenOrientation & {
    lock?: (mode: 'landscape') => Promise<void>;
  }) | undefined;
  private readonly coarse = matchMedia(touchScreen);
  private readonly portrait = matchMedia(touchScreen + ' and (orientation: portrait)');
  private readonly prompt = document.getElementById('rotate-prompt') as HTMLDialogElement;
  private readonly title = document.getElementById('rotate-title') as HTMLElement;
  private readonly desc = document.getElementById('rotate-desc') as HTMLElement | null;
  private readonly button = document.getElementById('btn-landscape') as HTMLButtonElement;
  private readonly onPause: () => void;
  private fullscreenBlocked = false;

  constructor(onPause: () => void) {
    this.onPause = onPause;
    lockZoom();

    this.button.addEventListener('click', () => void this.request());
    this.prompt.addEventListener('cancel', (e) => e.preventDefault());
    this.portrait.addEventListener('change', () => this.sync());
    this.coarse.addEventListener('change', () => this.sync());
    document.addEventListener('fullscreenchange', () => this.sync());
    document.addEventListener('webkitfullscreenchange', () => this.sync());
    window.addEventListener('resize', () => this.sync());

    this.sync();
  }

  private get isMobile(): boolean {
    return this.coarse.matches;
  }

  private get canFullscreen(): boolean {
    if (this.fullscreenBlocked) return false;
    const doc = document as WebkitDocument;
    const el = document.documentElement as WebkitElement;
    const supported = Boolean(
      (document.fullscreenEnabled && typeof el.requestFullscreen === 'function') ||
        (doc.webkitFullscreenEnabled && typeof el.webkitRequestFullscreen === 'function')
    );
    return supported;
  }

  private get isFullscreen(): boolean {
    const doc = document as WebkitDocument;
    return Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
  }

  private get needsFullscreen(): boolean {
    return this.isMobile && this.canFullscreen && !this.isFullscreen;
  }

  get paused(): boolean {
    return this.portrait.matches || this.needsFullscreen;
  }

  private sync(): void {
    const portrait = this.portrait.matches;
    const needFs = this.needsFullscreen;
    if (portrait || needFs) {
      this.onPause();
      if (portrait) {
        this.title.textContent = 'Putar HP ke samping';
        if (this.desc) this.desc.textContent = 'Laguna dimainkan dalam layar penuh horizontal.';
        this.button.textContent = 'Aktifkan layar penuh horizontal';
        this.button.hidden = !this.canFullscreen && !this.orientation?.lock;
      } else {
        this.title.textContent = 'Aktifkan layar penuh';
        if (this.desc) this.desc.textContent = 'Mainkan ALUN dalam layar penuh horizontal agar tampilan pas di layar HP.';
        this.button.textContent = 'Masuk layar penuh horizontal';
        this.button.hidden = false;
      }
      if (!this.prompt.open) this.prompt.showModal();
    } else if (this.prompt.open) {
      this.prompt.close();
    }
  }

  async request(): Promise<void> {
    if (!this.isMobile) return;
    const el = document.documentElement as WebkitElement;
    if (!this.isFullscreen && this.canFullscreen) {
      try {
        if (typeof el.requestFullscreen === 'function') {
          await el.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
        } else if (typeof el.webkitRequestFullscreen === 'function') {
          await el.webkitRequestFullscreen();
        }
      } catch {
        // Embedded contexts without allowfullscreen may deny fullscreen; don't soft-lock landscape play.
        this.fullscreenBlocked = true;
      }
    }
    if (this.orientation?.lock) {
      try {
        await this.orientation.lock('landscape');
      } catch {
        // Some mobile browsers require physical rotation after entering fullscreen.
      }
    }
    this.sync();
  }
}
