export type Tier = 'low' | 'medium' | 'high' | 'ultra';
export type QualitySetting = 'auto' | Tier;

export interface Quality {
  tier: Tier;
  /** Cheaper shader paths: fewer taps, single-octave noise, vertex swell. */
  lite: boolean;
  /** Extra shader detail reserved for Ultra. */
  ultra: boolean;
  /** Render static world into a native-res 4x MSAA cache when the play/title camera is fixed. */
  cached: boolean;
  /** Composite and draw dynamic objects directly to the default framebuffer in sRGB (skips rtFinal + post.comp). */
  directLdr: boolean;
  /** Water shader detail level: 0 = Low, 1 = Medium, 2 = High, 3 = Ultra. */
  waterDetail: 0 | 1 | 2 | 3;
  /** MSAA samples used when baking the static world cache. */
  staticMsaa: 0 | 4;
  /** MSAA samples on live render targets (rtScene / rtFinal). */
  msaa: 0 | 4;
  /** Water surface resolution multiplier (0.42..0.56 on cached tiers, 1.0 on live tiers). */
  waterScale: number;
  /** Full-screen FXAA post pass. */
  fxaa: boolean;
  /** Number of bloom mip levels and starting divisor (2, 4, or 6). */
  bloomLevels: number;
  bloomStartDiv: 2 | 4 | 6;
  /** Max devicePixelRatio and megapixel cap. */
  dprCap: number;
  mp: number;
  minMp: number;
  /** Frame time target in milliseconds. */
  target: number;
  field: [number, number];
  foam: [number, number];
  ripple: [number, number];
  shadow: number;
  shadowEvery: number;
  /** Spacing of the water grid and ground mesh. */
  grid: number;
  land: number;
  /** Share of undergrowth instances shown (0..1). */
  brush: number;
}

export const TIERS: Record<Tier, Quality> = {
  low: {
    tier: 'low',
    lite: true,
    ultra: false,
    cached: true,
    directLdr: true,
    waterDetail: 0,
    staticMsaa: 4,
    msaa: 0,
    waterScale: 0.32,
    fxaa: false,
    bloomLevels: 2,
    bloomStartDiv: 6,
    dprCap: 1,
    mp: 2.6,
    minMp: 1.85,
    target: 16.7,
    field: [320, 240],
    foam: [320, 240],
    ripple: [128, 96],
    shadow: 1024,
    shadowEvery: 1,
    grid: 0.92,
    land: 1.35,
    brush: 0.74,
  },
  medium: {
    tier: 'medium',
    lite: false,
    ultra: false,
    cached: true,
    directLdr: true,
    waterDetail: 1,
    staticMsaa: 4,
    msaa: 0,
    waterScale: 0.56,
    fxaa: false,
    bloomLevels: 3,
    bloomStartDiv: 4,
    dprCap: 1.25,
    mp: 2.6,
    minMp: 1.6,
    target: 21,
    field: [640, 480],
    foam: [512, 384],
    ripple: [256, 192],
    shadow: 1536,
    shadowEvery: 1,
    grid: 0.44,
    land: 1.15,
    brush: 0.9,
  },
  high: {
    tier: 'high',
    lite: false,
    ultra: false,
    cached: false,
    directLdr: false,
    waterDetail: 2,
    staticMsaa: 4,
    msaa: 4,
    waterScale: 1,
    fxaa: true,
    bloomLevels: 5,
    bloomStartDiv: 2,
    dprCap: 1.5,
    mp: 3.7,
    minMp: 1.6,
    target: 16.7,
    field: [1280, 960],
    foam: [960, 720],
    ripple: [512, 384],
    shadow: 2048,
    shadowEvery: 1,
    grid: 0.31,
    land: 1,
    brush: 1,
  },
  ultra: {
    tier: 'ultra',
    lite: false,
    ultra: true,
    cached: false,
    directLdr: false,
    waterDetail: 3,
    staticMsaa: 4,
    msaa: 4,
    waterScale: 1,
    fxaa: true,
    bloomLevels: 5,
    bloomStartDiv: 2,
    dprCap: 2,
    mp: 5.5,
    minMp: 2.2,
    target: 16.7,
    field: [1408, 1056],
    foam: [1152, 864],
    ripple: [512, 384],
    shadow: 3072,
    shadowEvery: 1,
    grid: 0.26,
    land: 1,
    brush: 1,
  },
};

export const TIER_ORDER: Tier[] = ['low', 'medium', 'high', 'ultra'];

const PREF_KEY = 'alun_graphics_v1';

export function isTier(v: unknown): v is Tier {
  return v === 'low' || v === 'medium' || v === 'high' || v === 'ultra';
}

export function isQualitySetting(v: unknown): v is QualitySetting {
  return v === 'auto' || isTier(v);
}

export function loadQualitySetting(): QualitySetting {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (isQualitySetting(raw)) return raw;
  } catch {
    // Storage may be unavailable in sandboxed iframes
  }
  return 'auto';
}

export function saveQualitySetting(setting: QualitySetting): void {
  try {
    localStorage.setItem(PREF_KEY, setting);
  } catch {
    // Ignore storage failures
  }
}

export function getUrlQualityOverride(): QualitySetting | null {
  try {
    const asked = new URLSearchParams(location.search).get('q')?.toLowerCase() ?? null;
    return isQualitySetting(asked) ? asked : null;
  } catch {
    return null;
  }
}

/** Active quality configuration; updated live when the tier changes. */
export let Q: Quality = { ...TIERS.high };

export function setActiveTier(tier: Tier): Quality {
  Q = { ...TIERS[tier] };
  return Q;
}

export function chooseQuality(gl: WebGLRenderingContext | WebGL2RenderingContext): {
  setting: QualitySetting;
  tier: Tier;
  fromUrl: boolean;
} {
  const urlPref = getUrlQualityOverride();
  const setting: QualitySetting = urlPref ?? loadQualitySetting();
  const tier: Tier = setting === 'auto' ? guessTier(gl) : setting;
  setActiveTier(tier);
  return { setting, tier, fromUrl: urlPref !== null };
}

/** Initial tier guess from GPU renderer string; Auto refines this from measured frame times. */
export function guessTier(gl: WebGLRenderingContext | WebGL2RenderingContext): Tier {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '');
  if (!name) return 'medium';
  if (/swiftshader|llvmpipe|basic render|mali|adreno|powervr/i.test(name)) return 'low';
  if (/intel/i.test(name) && !/iris|arc/i.test(name)) return 'low';
  if (/iris|vega|radeon(\(tm\))? graphics|geforce (mx|gt )|geforce (8|9)\d\dm|apple/i.test(name)) return 'medium';
  if (/rtx|gtx|radeon rx|arc /i.test(name)) return 'high';
  return 'medium';
}
