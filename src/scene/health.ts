/**
 * How the coast looks for a given pollution. The three bands of the plan are three looks: clear to 29,
 * a litter line and murky edges from 30, oil on the sand and pale coral from 60.
 */
const LOOK: [number, number][] = [
  [0, 1],
  [29, 0.82],
  [30, 0.64],
  [36, 0.48],
  [59, 0.27],
  [60, 0.16],
  [100, 0],
];

/** 1 is the lagoon as it should be, 0 is as bad as it gets. Drives water, coral, fish, birds and litter. */
export function coastLook(pollution: number): number {
  const p = Math.min(100, Math.max(0, pollution));
  for (let i = 1; i < LOOK.length; i++) {
    const [p1, v1] = LOOK[i];
    if (p > p1) continue;
    const [p0, v0] = LOOK[i - 1];
    return v0 + ((v1 - v0) * (p - p0)) / (p1 - p0);
  }
  return 0;
}

/** How murky the water is for that look: none while healthy, all of it at the end. */
export function murkOf(look: number): number {
  return Math.min(1, Math.max(0, 1 - look / 0.66));
}
