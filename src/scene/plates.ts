import type { GameSimulation } from '../simulation';
import type { Entity } from '../types';
import { P_HEALTHY } from '../story/state';

/**
 * Name plates in the water, so the lagoon can be read with the sound off: whose ship that is and what it
 * is doing, and which part of the coast is waiting to be put right.
 */

export type PlateTone = 'foe' | 'busy' | 'open' | 'friend' | 'care';

export interface Plate {
  x: number;
  y: number;
  /** How far below its middle the plate hangs, in scene units. */
  drop: number;
  text: string;
  tone: PlateTone;
  /** How far along its work is, 0..1; below 0 there is none to show. */
  work: number;
  /** What is left of the hull, 0..1; below 0 it is unhurt. */
  hull: number;
}

/** The hull of a thing that has taken a hit. */
function hurt(e: Entity): number {
  return e.maxHp >= 2 && e.hp < e.maxHp ? Math.max(0, e.hp / e.maxHp) : -1;
}

function plateFor(sim: GameSimulation, e: Entity): Plate | null {
  const s = sim.story.s;
  const job = s.job;
  const at = (drop: number, text: string, tone: PlateTone, work = -1, hull = hurt(e)): Plate => ({ x: e.x, y: e.y, drop, text, tone, work, hull });
  switch (e.kind) {
    case 'raider':
      return job?.kind === 'raid' && job.phase === 'seize' ? at(4.7, 'MERAMPAS KERANJANG', 'busy', job.work) : at(4.7, 'PENJARAH', 'foe');
    case 'trawl_ship':
      return job?.kind === 'trawl' && job.phase === 'haul' ? at(6.4, 'MENARIK PUKAT', 'busy', job.work) : at(6.4, 'KAPAL PUKAT', 'foe');
    case 'polluter':
      return job?.kind === 'waste' && job.phase === 'dump' ? at(5.2, 'MENURUNKAN DRUM', 'busy', job.work) : at(5.2, 'KAPAL DRUM', 'foe');
    case 'trawler': {
      if (job?.kind !== 'boss') return at(8, 'KAPAL INDUK', 'foe');
      if (job.phase === 'gear_trawl') return at(8, 'MENARIK PUKAT', 'busy', job.work);
      if (job.phase === 'gear_drum') return at(8, 'MEMBUANG DRUM', 'busy', job.work);
      if (job.phase === 'window') return at(8, 'HANTAM LAMBUNGNYA!', 'open');
      return at(8, 'KAPAL INDUK', 'foe');
    }
    case 'boat':
      return at(4.2, e.variant % 2 ? 'NELAYAN' : 'PAK DAMAR', 'friend');
    case 'drum':
      return at(2.9, 'DRUM MINYAK', 'busy');
    case 'oil': {
      if (e.source === undefined) return null;
      const old = s.sources.find((q) => q.id === e.source)?.old === true;
      // the old blotch is only scenery until somebody comes to add to it, or the coast is doing badly
      if (old && !s.flags.waste && job?.kind !== 'waste' && !(s.flags.toolbox && s.pollution > P_HEALTHY)) return null;
      return at(5.2, old ? 'MINYAK LAMA' : 'TUMPAHAN MINYAK', 'care', -1, -1);
    }
    case 'ghost_net':
      return e.source === undefined ? null : at(4.2, 'JARING HANTU', 'care');
    case 'deposit':
      return at(3.6, 'ENDAPAN', 'care');
    default:
      return null;
  }
}

export function platesFor(sim: GameSimulation): Plate[] {
  const out: Plate[] = [];
  for (const e of sim.entities) {
    // a ship that has given up is nobody's worry any more
    if (e.tag === 'leaving') continue;
    const p = plateFor(sim, e);
    if (p) out.push(p);
  }
  return out;
}
