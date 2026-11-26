const touchScreen = '(pointer: coarse)';

export class LandscapeMode {
  private readonly orientation = screen.orientation as (ScreenOrientation & {
    lock?: (mode: 'landscape') => Promise<void>;
  }) | undefined;
  private readonly portrait = matchMedia(touchScreen + ' and (orientation: portrait)');
  private readonly prompt = document.getElementById('rotate-prompt') as HTMLDialogElement;
  private readonly button = document.getElementById('btn-landscape') as HTMLButtonElement;

  constructor(onPause: () => void) {
    const sync = () => {
      if (this.portrait.matches) {
        onPause();
        if (!this.prompt.open) this.prompt.showModal();
      } else if (this.prompt.open) {
        this.prompt.close();
      }
    };
    this.button.hidden = !this.orientation?.lock;
    this.button.addEventListener('click', () => void this.request());
    this.prompt.addEventListener('cancel', (e) => e.preventDefault());
    this.portrait.addEventListener('change', sync);
    sync();
  }

  get paused(): boolean {
    return this.portrait.matches;
  }

  async request(): Promise<void> {
    if (!matchMedia(touchScreen).matches || !this.orientation?.lock) return;
    try {
      if (!document.fullscreenElement && document.fullscreenEnabled) {
        await document.documentElement.requestFullscreen();
      }
      await this.orientation.lock('landscape');
    } catch {
      // Browsers and embedded games may allow only physical rotation.
      this.button.hidden = true;
    }
  }
}
