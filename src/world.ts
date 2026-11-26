/**
 * Tropical Island & Lagoon Geometry (1280 x 720 virtual coordinates).
 * Every coastal landmark derives from getShoreX(y) so visuals and collisions align to the pixel.
 */

import type { EntityKind, Point } from './types';

export type { Point } from './types';

export const WORLD_W = 1280;
export const WORLD_H = 720;

export interface SeaRock {
  x: number;
  y: number;
  r: number;
  points: Point[];
}

export interface CoralCluster {
  x: number;
  y: number;
  r: number;
  seed: number;
}

export interface PalmTree {
  x: number;
  y: number;
  scale: number;
  fronds: number;
  phase: number;
}

/**
 * Returns the X coordinate of the water/sand shoreline at a given Y.
 * Left of shoreX is tropical island land; right of shoreX is lagoon water.
 */
export function getShoreX(y: number): number {
  const t = y / WORLD_H;
  return (
    265 +
    Math.sin(t * Math.PI * 1.45 + 0.55) * 62 +
    Math.cos(t * Math.PI * 3.1) * 18 -
    (t > 0.35 && t < 0.72 ? Math.sin(((t - 0.35) / 0.37) * Math.PI) * 34 : 0)
  );
}

/**
 * Returns the X coordinate where dense rainforest canopy begins (inland from golden beach).
 */
export function getForestX(y: number): number {
  return getShoreX(y) - 68 + Math.sin(y * 0.025) * 14;
}

const PIER_Y = 468;
const PIER_SHORE_X = getShoreX(PIER_Y);

/** Village wooden pier & docking zone anchored solidly to shoreline */
export const VILLAGE_PIER = {
  x: Math.round(PIER_SHORE_X),
  y: PIER_Y,
  dockX: Math.round(PIER_SHORE_X + 76),
  dockY: PIER_Y + 4,
  dockRadius: 58,
};

const NET_Y = 352;
/** Semicircular floating collector net right off the sandy bay */
export const COLLECTOR_NET = {
  x: Math.round(getShoreX(NET_Y) + 74),
  y: NET_Y,
};

/** Rafflesia flower nestled near the upper-left jungle edge */
export const RAFFLESIA_POS: Point = {
  x: Math.round(getForestX(188) - 22),
  y: 188,
};

/** Forest-edge fire spawn spots aligned right along the beach-jungle transition */
export const FIRE_SPOTS: Point[] = [116, 188, 258, 594].map((y) => ({
  x: Math.round(getShoreX(y) - 24),
  y,
}));

/** Mudbank shoreline slots aligned right along the wet tidal coast */
const MANGROVE_YS = [
  66, 102, 138, 174, 210, 246, 282, 534, 566, 598, 630, 662, 690, 84, 156, 228, 550, 614, 676,
];
export const MANGROVE_SLOTS: Point[] = MANGROVE_YS.map((y, idx) => ({
  x: Math.round(getShoreX(y) + (idx % 2 === 0 ? 2 : -8)),
  y,
}));

/** Where the dolphin gets caught: the south-east of the lagoon, in the lee of the small rocks. */
export const DOLPHIN_SPOT: Point = { x: 880, y: 560 };

/** The end of the pier, where Bu Sari stands and takes things in hand. */
export const PIER_END: Point = { x: 362, y: 474 };

/** The mooring pole off the pier. The tool chest is caught under it, and its rope lets it go no further. */
export const MOORING: Point = { x: 486, y: 450 };
export const MOORING_ROPE = 150;

/** The six pieces that close the pier: one group before the net, one around the mooring. */
export const OPENING_TRASH: { kind: EntityKind; variant: number; x: number; y: number }[] = [
  { kind: 'trash_bottle', variant: 0, x: 462, y: 352 },
  { kind: 'trash_bag', variant: 0, x: 500, y: 306 },
  { kind: 'trash_bottle', variant: 1, x: 512, y: 392 },
  { kind: 'trash_bottle', variant: 2, x: 446, y: 462 },
  { kind: 'trash_bag', variant: 1, x: 494, y: 452 },
  { kind: 'trash_bottle', variant: 0, x: 528, y: 492 },
];

/** Where Pak Damar waits for a way in, and the gap in the reef he comes through. */
export const WAITING_SPOT: Point = { x: 1196, y: 432 };
export const REEF_GAP: Point = { x: 1096, y: 432 };

/** The spawning ground: the trawl drags the school out of it, and the dolphins come home along it. */
export const SPAWNING_GROUND: Point = { x: 872, y: 226 };
export const TRAWL_STATION: Point = { x: 970, y: 238 };

/** An old blotch of oil on the lee side of the big rock, and where the drum carrier means to add to it. */
export const OLD_BLOTCH: Point = { x: 1006, y: 300 };
export const DUMP_STATION: Point = { x: 1150, y: 372 };
export const DUMP_SPOT: Point = { x: 1046, y: 392 };

/** Where a lost trawl settles on the coral. */
export const GHOST_SPOTS: Point[] = [
  { x: 912, y: 132 },
  { x: 1092, y: 618 },
];

/** Where a leak settles when there is no room left at the usual place. */
export const SPILL_SPOTS: Point[] = [
  { x: 1046, y: 392 },
  { x: 930, y: 330 },
  { x: 960, y: 452 },
];

/** Deposits under the tide line, in the order the fishers point them out. */
export const DEPOSIT_SPOTS: Point[] = [252, 292, 568, 612, 206, 650, 160, 540].map((y) => ({
  x: Math.round(getShoreX(y) + 12),
  y,
}));

/** Where the raiders drop anchor: spread along the pier & net so multiple pirates attack cleanly. */
export const RAID_ANCHORS: Point[] = [
  { x: 448, y: 468 },
  { x: 454, y: 406 },
  { x: 438, y: 526 },
  { x: 446, y: 334 },
  { x: 462, y: 582 },
];

/** Entry lanes around the outer lagoon for multi-ship pirate waves. */
export const PIRATE_LANES: { x: number; y: number; rot: number }[] = [
  { x: WORLD_W + 64, y: 410, rot: Math.PI },
  { x: WORLD_W + 64, y: 268, rot: Math.PI * 0.94 },
  { x: WORLD_W + 64, y: 556, rot: -Math.PI * 0.92 },
  { x: 960, y: WORLD_H + 64, rot: -Math.PI * 0.64 },
  { x: 740, y: WORLD_H + 64, rot: -Math.PI * 0.62 },
  { x: WORLD_W + 64, y: 158, rot: Math.PI * 0.88 },
];

/** Strategic lagoon coordinates for Autonomous AI Buoys */
export const AI_BUOY_SLOTS: Point[] = [
  { x: 640, y: 355 },
  { x: 825, y: 215 },
  { x: 815, y: 520 },
];

function makeRockPolygon(r: number, seed: number): Point[] {
  const pts: Point[] = [];
  const count = 8;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const jitter = 0.76 + ((Math.sin(seed * 17.3 + i * 3.7) + 1) * 0.5) * 0.34;
    pts.push({ x: Math.cos(a) * r * jitter, y: Math.sin(a) * r * jitter });
  }
  return pts;
}

/** Volcanic sea rocks in the right lagoon */
export const SEA_ROCKS: SeaRock[] = [
  { x: 1068, y: 246, r: 34, points: makeRockPolygon(34, 1.2) },
  { x: 1028, y: 506, r: 24, points: makeRockPolygon(24, 2.8) },
  { x: 966, y: 546, r: 17, points: makeRockPolygon(17, 4.1) },
];

/** Vibrant underwater coral gardens (top-right and bottom-right) */
export const CORAL_CLUSTERS: CoralCluster[] = [
  { x: 880, y: 72, r: 62, seed: 1 },
  { x: 965, y: 96, r: 46, seed: 2 },
  { x: 1152, y: 618, r: 70, seed: 3 },
  { x: 1066, y: 658, r: 48, seed: 4 },
  { x: 1218, y: 542, r: 52, seed: 5 },
];

/** Swaying coconut palm trees framing the golden beach */
export const PALM_TREES: PalmTree[] = [
  { y: 76, inset: 46, scale: 1.05, fronds: 7, phase: 0.4 },
  { y: 142, inset: 60, scale: 0.94, fronds: 6, phase: 1.5 },
  { y: 244, inset: 54, scale: 1.12, fronds: 7, phase: 2.3 },
  { y: 312, inset: 74, scale: 0.96, fronds: 6, phase: 3.1 },
  { y: 382, inset: 64, scale: 0.9, fronds: 6, phase: 0.9 },
  { y: 556, inset: 56, scale: 1.04, fronds: 7, phase: 4.2 },
  { y: 642, inset: 42, scale: 1.08, fronds: 7, phase: 5.0 },
].map((p) => ({
  x: Math.round(getShoreX(p.y) - p.inset),
  y: p.y,
  scale: p.scale,
  fronds: p.fronds,
  phase: p.phase,
}));

/** Dense rainforest canopy foliage blobs inland on the far left */
export const CANOPY_CLUSTERS: { x: number; y: number; r: number; tone: number }[] = [
  { x: 42, y: 32, r: 78, tone: 0 },
  { x: 132, y: 46, r: 68, tone: 1 },
  { x: 214, y: 34, r: 54, tone: 2 },
  { x: 56, y: 122, r: 72, tone: 1 },
  { x: 128, y: 132, r: 58, tone: 0 },
  { x: 44, y: 214, r: 76, tone: 2 },
  { x: 108, y: 236, r: 58, tone: 1 },
  { x: 48, y: 314, r: 72, tone: 0 },
  { x: 96, y: 362, r: 52, tone: 2 },
  { x: 42, y: 424, r: 68, tone: 1 },
  { x: 54, y: 522, r: 76, tone: 0 },
  { x: 102, y: 588, r: 62, tone: 2 },
  { x: 44, y: 644, r: 76, tone: 1 },
  { x: 112, y: 696, r: 62, tone: 0 },
];

export function isPointInWater(x: number, y: number): boolean {
  return x > getShoreX(y) - 18 && x < WORLD_W && y >= 0 && y <= WORLD_H;
}
