/**
 * Player settings, kept apart from the story save: erasing a story or losing a run keeps them.
 * Graphics quality has its own key in src/scene/quality.ts.
 */

export type VoiceMode = 'voice' | 'babble' | 'off';
export type TextSpeed = 'slow' | 'normal' | 'fast';
export type FilmMode = 'play' | 'skip';

export interface Volumes {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  voice: number;
  ui: number;
}

export type VolumeChannel = keyof Volumes;

export interface GameSettings {
  volume: Volumes;
  muted: boolean;
  /** How the people on the radio sound: their recorded voice, a murmur, or nothing. */
  voiceMode: VoiceMode;
  textSpeed: TextSpeed;
  films: FilmMode;
  shake: boolean;
  hoverSounds: boolean;
}

const KEY = 'alun_settings_v1';

export const VOLUME_CHANNELS: VolumeChannel[] = ['master', 'music', 'sfx', 'ambience', 'voice', 'ui'];

export const DEFAULT_SETTINGS: GameSettings = {
  volume: { master: 1, music: 0.8, sfx: 1, ambience: 0.85, voice: 1, ui: 0.8 },
  muted: false,
  voiceMode: 'voice',
  textSpeed: 'normal',
  films: 'play',
  shake: true,
  hoverSounds: true,
};

/** Letters per second the radio text appears at. */
/** Letters per second for lines nobody recorded: about how fast people talk. */
export const TEXT_CPS: Record<TextSpeed, number> = { slow: 14, normal: 20, fast: 32 };

const unit = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
const pick = <T extends string>(v: unknown, options: readonly T[], d: T): T =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : d;

function clean(raw: unknown): GameSettings {
  const d = DEFAULT_SETTINGS;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof GameSettings, unknown>>;
  const v = (r.volume && typeof r.volume === 'object' ? r.volume : {}) as Partial<Record<VolumeChannel, unknown>>;
  const volume = {} as Volumes;
  for (const ch of VOLUME_CHANNELS) volume[ch] = unit(v[ch], d.volume[ch]);
  return {
    volume,
    muted: typeof r.muted === 'boolean' ? r.muted : d.muted,
    voiceMode: pick(r.voiceMode, ['voice', 'babble', 'off'] as const, d.voiceMode),
    textSpeed: pick(r.textSpeed, ['slow', 'normal', 'fast'] as const, d.textSpeed),
    films: pick(r.films, ['play', 'skip'] as const, d.films),
    shake: typeof r.shake === 'boolean' ? r.shake : d.shake,
    hoverSounds: typeof r.hoverSounds === 'boolean' ? r.hoverSounds : d.hoverSounds,
  };
}

export function loadSettings(): GameSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    return clean(raw ? JSON.parse(raw) : null);
  } catch {
    return clean(null);
  }
}

export function saveSettings(s: GameSettings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // private mode or full storage: the settings still hold for this visit
  }
}

/** Films are skipped when the player asked to, or when the device asks for less motion. */
export function skipFilms(s: GameSettings): boolean {
  if (s.films === 'skip') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
