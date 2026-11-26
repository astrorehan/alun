import * as THREE from 'three';
import type { Pose } from './director';
import type { Fx } from './fx';
import { clamp, lerp, smooth } from './space';
import { MODE, SP } from './sprites';
import { PIER_HEAD, type StoryFilm, type StoryLayer } from './story';

/**
 * The end of the story: first light, Pak Damar's boat coming in to the place that was closed, and the
 * mother and her calf passing beside it. The camera then lifts back into the game the player keeps.
 */

export interface EndingHooks {
  /** A subtitle to show, or two empty strings to clear it. */
  caption?: (kicker: string, line: string) => void;
  sound?: (kind: 'dolphin' | 'birds' | 'boat') => void;
}

export const ENDING_LENGTH = 12.4;

const CAPTIONS: [number, number, string, string][] = [
  [0.5, 3.9, 'FAJAR', 'Perahu Pak Damar pulang membawa ikan.'],
  [4.3, 7.7, 'DERMAGA TERBUKA', 'Ia bersandar di tempat yang dulu tertutup sampah.'],
  [8.1, 11.8, 'CERITA TAMAT', 'Induk dan anaknya melintas di sampingnya. Laguna ini dijaga bersama.'],
];

/** Where the boat comes from, and how long it takes to lie alongside. */
const FROM = new THREE.Vector2(-5, 17);
const DOCKED_AT = 4.6;
/** The dolphins' pass along the pier head, from the south to the north. */
const PASS_FROM = 4.7;
const PASS_TO = 9.6;

export class Ending {
  private film: StoryFilm | null = null;
  private hooks: EndingHooks = {};
  private shown = -1;
  private said = { dolphin: false, birds: false, boat: false };
  private cheered = 0;
  private start: Pose | null = null;

  constructor(
    private story: StoryLayer,
    private fx: Fx
  ) {}

  get active(): boolean {
    return this.film !== null;
  }

  begin(hooks: EndingHooks): void {
    this.hooks = hooks;
    this.shown = -1;
    this.said = { dolphin: false, birds: false, boat: false };
    this.cheered = 0;
    this.start = null;
    this.film = { boat: { x: FROM.x, z: FROM.y, yaw: 0 }, pod: null };
    this.story.film = this.film;
  }

  /** The camera, one pose per frame. False when the film is over. */
  shoot(t: number, out: Pose, play: Pose): boolean {
    this.start ??= { pos: out.pos.clone(), look: out.look.clone(), fov: out.fov };
    const head = PIER_HEAD;
    if (t < 4.2) {
      // down from the play view to the water in front of the pier, the boat coming past
      const s = this.start;
      const k = smooth(0, 1, t / 2.6);
      const px = lerp(-11.5, -13.5, smooth(1.5, 4.2, t));
      out.pos.set(lerp(s.pos.x, px, k), lerp(s.pos.y, 4.4, k), lerp(s.pos.z, 27.5, k));
      out.look.set(lerp(s.look.x, head.x + 3.5, k), lerp(s.look.y, 1.4, k), lerp(s.look.z, 11.5, k));
      out.fov = lerp(s.fov, 36, k);
    } else if (t < 9.4) {
      // alongside, low: the boat at the pier, and the two of them going by between it and us
      const u = smooth(0, 1, (t - 4.2) / 5.2);
      out.pos.set(lerp(-13.5, -11.4, u), lerp(4.4, 3.3, u), lerp(27.5, 18.2, u));
      out.look.set(lerp(head.x + 3.5, head.x + 1.5, u), lerp(1.4, 1.3, u), lerp(11.5, 9.6, u));
      out.fov = lerp(36, 38, u);
    } else if (t < ENDING_LENGTH) {
      const u = smooth(0, 1, (t - 9.4) / (ENDING_LENGTH - 9.4));
      out.pos.set(lerp(-11.4, play.pos.x, u), lerp(3.3, play.pos.y, u), lerp(18.2, play.pos.z, u));
      out.look.set(lerp(head.x + 1.5, play.look.x, u), lerp(1.3, play.look.y, u), lerp(9.6, play.look.z, u));
      out.fov = lerp(38, play.fov, u);
    } else {
      out.pos.copy(play.pos);
      out.look.copy(play.look);
      out.fov = play.fov;
      return false;
    }
    return true;
  }

  update(t: number): void {
    const f = this.film;
    if (!f) return;
    let cap = -1;
    for (let i = 0; i < CAPTIONS.length; i++) if (t >= CAPTIONS[i][0] && t < CAPTIONS[i][1]) cap = i;
    if (cap !== this.shown) {
      this.shown = cap;
      if (cap >= 0) this.hooks.caption?.(CAPTIONS[cap][2], CAPTIONS[cap][3]);
      else this.hooks.caption?.('', '');
    }

    /* the boat: in on a curve, and round to lie along the pier */
    const u = clamp(t / DOCKED_AT, 0, 1);
    const k = 1 - Math.pow(1 - u, 2.2);
    const bend = Math.sin(k * Math.PI) * 2.2;
    f.boat!.x = lerp(FROM.x, PIER_HEAD.x, k);
    f.boat!.z = lerp(FROM.y, PIER_HEAD.z, k) + bend;
    f.boat!.yaw = lerp(Math.PI * 0.96, PIER_HEAD.yaw, smooth(0.55, 1, u));
    if (u >= 0.97) this.say('boat');
    this.say('birds');

    /* the dolphins */
    if (t >= PASS_FROM && t <= PASS_TO) {
      const p = (t - PASS_FROM) / (PASS_TO - PASS_FROM);
      f.pod = {
        x: lerp(-17.0, -19.2, p) + Math.sin(p * 5) * 0.5,
        z: lerp(27, -6, p),
        yaw: Math.PI / 2 + 0.06,
        leap: 0.85,
      };
      if (p > 0.12) this.say('dolphin');
    } else f.pod = null;

    /* gold dust over the pier when the boat touches it */
    if (t > DOCKED_AT && this.cheered < 3 && t > DOCKED_AT + this.cheered * 1.1) {
      this.cheered += 1;
      this.story.onCheer?.();
      this.fx.burst(PIER_HEAD.x - 1.6, 1.8, PIER_HEAD.z + (this.cheered - 2) * 1.4, 12, 4.4, 2, 0.16);
    }
    const glow = smooth(4.2, 6, t) * (1 - smooth(10.5, 12, t));
    if (glow > 0.02) this.fx.sprites.push(PIER_HEAD.x, 2.6, PIER_HEAD.z, 7, 5, 0, 1.3, 0.9, 0.5, 0.16 * glow, SP.glow, MODE.billboard, 1);
  }

  private say(kind: 'dolphin' | 'birds' | 'boat'): void {
    if (this.said[kind]) return;
    this.said[kind] = true;
    this.hooks.sound?.(kind);
  }

  end(): void {
    if (!this.film) return;
    this.film = null;
    this.story.film = null;
    this.hooks.caption?.('', '');
    this.hooks = {};
  }
}
