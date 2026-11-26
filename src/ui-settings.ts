import { VOLUME_CHANNELS, type GameSettings, type VolumeChannel } from './settings';
import { getUiIconSvg } from './ui-kit/icons';

export type SettingsPane = 'graphics' | 'audio' | 'game';

export interface SettingsPanelHooks {
  /** Something changed; `what` names the setting, e.g. 'volume.music' or 'voiceMode'. */
  change: (s: GameSettings, what: string) => void;
  tab: () => void;
  click: () => void;
  /** A slider was let go: let the player hear the level they chose. */
  sample: (channel: VolumeChannel) => void;
  resetSave: () => void;
}

const PANES: SettingsPane[] = ['graphics', 'audio', 'game'];

/**
 * The settings window beyond graphics quality: volume per kind of sound, how people on the
 * radio talk, text speed, films, screen shake, full screen and erasing the save.
 * All three panes sit in one grid cell, so the window keeps its size whichever is open.
 */
export class SettingsPanel {
  private s: GameSettings;
  private pane: SettingsPane = 'graphics';
  private readonly tabs: HTMLButtonElement[];
  private readonly panes: HTMLElement[];
  private readonly sliders = new Map<VolumeChannel, { input: HTMLInputElement; value: HTMLElement; wrap: HTMLElement }>();

  constructor(private readonly root: HTMLElement, settings: GameSettings, private readonly hooks: SettingsPanelHooks) {
    this.s = structuredClone(settings);
    this.tabs = PANES.map((p) => root.querySelector(`[data-pane="${p}"]`) as HTMLButtonElement);
    this.panes = PANES.map((p) => root.querySelector(`#set-pane-${p}`) as HTMLElement);

    const icons: Record<string, Parameters<typeof getUiIconSvg>[0]> = {
      'set-tab-icon-graphics': 'sparkle',
      'set-tab-icon-audio': 'sound_on',
      'set-tab-icon-game': 'settings',
      'set-reset-icon': 'warn',
    };
    for (const id in icons) {
      const node = root.querySelector(`#${id}`);
      if (node) node.innerHTML = getUiIconSvg(icons[id]);
    }

    for (const ch of VOLUME_CHANNELS) {
      const wrap = root.querySelector(`[data-channel="${ch}"]`) as HTMLElement;
      const input = wrap.querySelector('input') as HTMLInputElement;
      const value = wrap.querySelector('.set-slider-val') as HTMLElement;
      this.sliders.set(ch, { input, value, wrap });
      input.addEventListener('input', () => {
        this.s.volume[ch] = Number(input.value) / 100;
        this.paintSlider(ch);
        this.hooks.change(this.copy(), `volume.${ch}`);
      });
      input.addEventListener('change', () => this.hooks.sample(ch));
    }

    this.tabs.forEach((tab, i) => tab.addEventListener('click', () => this.showPane(PANES[i], true)));
    const tablist = this.tabs[0].parentElement as HTMLElement;
    tablist.addEventListener('keydown', (e) => {
      const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
      const next = PANES[(PANES.indexOf(this.pane) + step + PANES.length) % PANES.length];
      this.showPane(next, true);
      this.tabs[PANES.indexOf(next)].focus();
    });

    root.querySelectorAll<HTMLButtonElement>('.set-switch').forEach((sw) => {
      sw.addEventListener('click', () => {
        const key = sw.dataset.setting as 'muted' | 'hoverSounds' | 'shake' | 'fullscreen';
        this.hooks.click();
        if (key === 'fullscreen') {
          void this.toggleFullscreen();
          return;
        }
        this.s[key] = !this.s[key];
        this.render();
        this.hooks.change(this.copy(), key);
      });
    });

    root.querySelectorAll<HTMLElement>('.set-seg').forEach((group) => {
      const key = group.dataset.setting as 'voiceMode' | 'textSpeed' | 'films';
      const options = Array.from(group.querySelectorAll<HTMLButtonElement>('[data-value]'));
      const choose = (btn: HTMLButtonElement): void => {
        if (btn.getAttribute('aria-checked') === 'true') return;
        (this.s as unknown as Record<string, string>)[key] = btn.dataset.value as string;
        this.hooks.tab();
        this.render();
        this.hooks.change(this.copy(), key);
      };
      for (const btn of options) btn.addEventListener('click', () => choose(btn));
      group.addEventListener('keydown', (e) => {
        const i = options.indexOf(document.activeElement as HTMLButtonElement);
        if (i < 0) return;
        let j = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % options.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + options.length) % options.length;
        if (j < 0) return;
        e.preventDefault();
        options[j].focus();
        choose(options[j]);
      });
    });

    root.querySelector('#btn-settings-reset')?.addEventListener('click', () => {
      this.hooks.click();
      this.hooks.resetSave();
    });

    const fsRow = root.querySelector('#set-row-fullscreen') as HTMLElement | null;
    if (fsRow && !document.fullscreenEnabled) fsRow.classList.add('is-unavailable');
    document.addEventListener('fullscreenchange', () => this.render());

    this.render();
  }

  private copy(): GameSettings {
    return structuredClone(this.s);
  }

  /** The settings changed elsewhere (the M key, a reset): show them as they are. */
  public set(settings: GameSettings): void {
    this.s = structuredClone(settings);
    this.render();
  }

  public get activePane(): SettingsPane {
    return this.pane;
  }

  public showPane(pane: SettingsPane, fromPlayer = false): void {
    if (pane === this.pane && !fromPlayer) return;
    if (pane !== this.pane && fromPlayer) this.hooks.tab();
    this.pane = pane;
    PANES.forEach((p, i) => {
      const on = p === pane;
      this.tabs[i].classList.toggle('is-active', on);
      this.tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
      this.tabs[i].tabIndex = on ? 0 : -1;
      this.panes[i].classList.toggle('is-off', !on);
      this.panes[i].toggleAttribute('inert', !on);
      this.panes[i].setAttribute('aria-hidden', on ? 'false' : 'true');
    });
  }

  /** Where the keyboard lands when the window opens: the active tab. */
  public focusTarget(): HTMLElement {
    return this.tabs[PANES.indexOf(this.pane)];
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // refused by the browser; the switch shows the real state on the next change
    }
    this.render();
  }

  private paintSlider(ch: VolumeChannel): void {
    const sl = this.sliders.get(ch);
    if (!sl) return;
    const pct = Math.round(this.s.volume[ch] * 100);
    sl.input.value = String(pct);
    sl.value.textContent = `${pct}%`;
    sl.wrap.style.setProperty('--v', String(pct / 100));
    sl.wrap.classList.toggle('is-silent', pct === 0 || this.s.muted);
  }

  private render(): void {
    for (const ch of VOLUME_CHANNELS) this.paintSlider(ch);
    this.root.querySelectorAll<HTMLButtonElement>('.set-switch').forEach((sw) => {
      const key = sw.dataset.setting as 'muted' | 'hoverSounds' | 'shake' | 'fullscreen';
      const on = key === 'fullscreen' ? !!document.fullscreenElement : this.s[key];
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
      const state = sw.querySelector('.set-switch-state');
      if (state) state.textContent = on ? 'Nyala' : 'Mati';
    });
    this.root.querySelectorAll<HTMLElement>('.set-seg').forEach((group) => {
      const value = (this.s as unknown as Record<string, string>)[group.dataset.setting as string];
      group.querySelectorAll<HTMLButtonElement>('[data-value]').forEach((btn) => {
        const on = btn.dataset.value === value;
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
        btn.tabIndex = on ? 0 : -1;
      });
    });
    this.root.classList.toggle('is-muted', this.s.muted);
  }
}
