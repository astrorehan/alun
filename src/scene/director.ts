import * as THREE from 'three';
import { clamp, lerp, smooth, toX, toZ } from './space';
import { COLLECTOR_NET, VILLAGE_PIER } from '../world';

export interface Pose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
}

const P = (px: number, py: number, pz: number, lx: number, ly: number, lz: number, fov: number): Pose => ({
  pos: new THREE.Vector3(px, py, pz),
  look: new THREE.Vector3(lx, ly, lz),
  fov,
});

/**
 * A camera move worked out live: given seconds into the take, write the pose for this frame.
 * Return false once the take is over. Used when the camera has to keep up with something moving.
 */
export type Reel = (t: number, out: Pose) => boolean;

export interface Shot {
  at: number;
  pose: Pose;
  /** Hard cut to this pose instead of travelling to it. */
  cut?: boolean;
  /** Scene speed from here on. Below 1 is slow motion; the camera itself keeps real time. */
  speed?: number;
  /** Announced once when the shot starts, for whoever runs the scene. */
  cue?: string;
}

const net = { x: toX(COLLECTOR_NET.x), z: toZ(COLLECTOR_NET.y) };
const pier = { x: toX(VILLAGE_PIER.x), z: toZ(VILLAGE_PIER.y) };

/** Low beach angle used behind the title. Weighted right, because the launch card sits on the left. */
export const TITLE_POSE = P(pier.x + 34.8, 4.6, pier.z + 17.7, pier.x - 3.6, 4.5, pier.z + 6.5, 38);

/**
 * Demo cutscene. Nothing here is prerendered: it is the gameplay scene with the camera moved,
 * which is the whole argument for building it in 3D.
 */
export const INTRO: Shot[] = [
  // in the water, looking out: the wave comes in with everything it has picked up
  { at: 0, pose: P(net.x + 14.5, 1.9, net.z + 12.2, net.x + 46, 3.0, net.z - 2, 40), speed: 0.5 },
  { at: 0.35, pose: P(net.x + 14.2, 1.9, net.z + 12.1, net.x + 45, 3.0, net.z - 1.6, 40), speed: 0.2, cue: 'wave' },
  { at: 3.3, pose: P(net.x + 10.5, 2.5, net.z + 10.4, net.x + 36, 2.4, net.z + 0.6, 42) },
  // behind the net as it arrives
  { at: 3.3, pose: P(net.x - 8.4, 3.2, net.z + 8.6, net.x + 8, 0.9, net.z - 2.2, 40), cut: true, speed: 0.4, cue: 'wave2' },
  { at: 6.1, pose: P(net.x - 7.2, 4.1, net.z + 11, net.x + 5, 1.0, net.z - 0.4, 40) },
  // and home
  { at: 6.1, pose: P(pier.x + 13.5, 3.6, pier.z + 15.5, pier.x - 4, 3.6, pier.z - 5, 37), cut: true, speed: 1 },
  { at: 9.5, pose: P(pier.x + 17.5, 7.2, pier.z + 17, pier.x - 4, 3.2, pier.z - 6, 38) },
];

export class Director {
  readonly camera = new THREE.PerspectiveCamera(27, 16 / 9, 1, 1400);
  private play: Pose = P(0, 100, 80, 0, 0, 0, 27);
  /** While set, play happens up close somewhere else: this replaces the overhead view as the resting pose. */
  private focusPose: Pose | null = null;
  private cur: Pose = P(0, 100, 80, 0, 0, 0, 27);
  private from: Pose = P(0, 100, 80, 0, 0, 0, 27);
  private to: Pose | null = null;
  private t = 1;
  private dur = 1;
  private shots: Shot[] | null = null;
  private reel: Reel | null = null;
  private shotT = 0;
  private after: (() => void) | null = null;
  /** Scene speed the running cutscene asks for; 1 the rest of the time. */
  speed = 1;
  onCue: ((cue: string) => void) | null = null;
  private mode: 'play' | 'title' = 'play';
  private started = false;
  private shakeT = 0;
  pitch = 50;
  fov = 26;
  yaw = 0;
  /** Subtle pointer parallax, -1..1. */
  parallaxX = 0;
  parallaxY = 0;
  private px = 0;
  private py = 0;
  /** Keep parallax and shake in screen space so they do not invalidate the cached 3D view. */
  use2DShift = false;
  /** UV offset (x, y) and overscan zoom (z) applied in post when use2DShift is active. */
  readonly screenShift = new THREE.Vector3(0, 0, 1);
  /** Incremented whenever the base settled pose changes (resize, pitch change, snap). */
  poseVersion = 0;

  get inCutscene(): boolean {
    return this.shots !== null || this.reel !== null;
  }

  /** Seconds into the running cutscene, or -1. Whatever performs in a cutscene keeps this clock so it stays in step with the camera. */
  get clock(): number {
    return this.shots || this.reel ? this.shotT : -1;
  }

  /** The overhead gameplay framing for the current aspect, as a copy. */
  get playPose(): Pose {
    return { pos: this.play.pos.clone(), look: this.play.look.clone(), fov: this.play.fov };
  }

  /** Where the camera settles when nothing is moving it. */
  private rest(): Pose {
    return this.mode === 'title' ? TITLE_POSE : (this.focusPose ?? this.play);
  }

  /**
   * Moves play somewhere else for a while: the gameplay camera frames `p` instead of the lagoon, with
   * input, parallax and caching working as usual. `null` goes back to the overhead view.
   */
  focus(p: Pose | null, seconds = 1.6): void {
    this.focusPose = p ? { pos: p.pos.clone(), look: p.look.clone(), fov: p.fov } : null;
    this.poseVersion++;
    if (!this.shots && !this.reel && this.mode === 'play') {
      this.hold = false;
      this.moveTo(this.rest(), seconds);
    }
  }

  get focused(): boolean {
    return this.focusPose !== null;
  }

  /** True when the camera is resting at a fixed pose and safe to cache. */
  isSettled(): boolean {
    if (this.shots || this.reel || this.to) return false;
    if (this.hold) return true;
    const tgt = this.rest();
    return (
      this.cur.pos.distanceToSquared(tgt.pos) < 1e-3 &&
      this.cur.look.distanceToSquared(tgt.look) < 1e-3 &&
      Math.abs(this.cur.fov - tgt.fov) < 1e-2
    );
  }

  /** 0 in the gameplay view (overhead, or a focus), 1 when the camera is somewhere cinematic. */
  cinematic(): number {
    return clamp(this.cur.pos.distanceTo((this.focusPose ?? this.play).pos) / 60, 0, 1);
  }

  fit(aspect: number, compact = false): void {
    const cam = new THREE.PerspectiveCamera(this.fov, aspect, 1, 1400);
    // On a handheld screen fit the playable coast, leaving out the deep inland scenery.
    const west = compact ? 180 : 20;
    const south = compact ? 700 : 712;
    const north = compact ? 36 : 20;
    const pts = [
      new THREE.Vector3(toX(west), 0, toZ(north)),
      new THREE.Vector3(toX(1274), 0, toZ(north)),
      new THREE.Vector3(toX(compact ? west : 52), 0, toZ(south)),
      new THREE.Vector3(toX(1274), 0, toZ(south)),
    ];
    const p = (this.pitch * Math.PI) / 180;
    const yaw = (this.yaw * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(p), Math.sin(p), Math.cos(yaw) * Math.cos(p));
    const target = new THREE.Vector3(2, 0, 0);
    let dist = 150;
    const v = new THREE.Vector3();
    for (let i = 0; i < 60; i++) {
      cam.position.copy(target).addScaledVector(dir, dist);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      let x0 = 9;
      let x1 = -9;
      let y0 = 9;
      let y1 = -9;
      for (const q of pts) {
        v.copy(q).project(cam);
        x0 = Math.min(x0, v.x);
        x1 = Math.max(x1, v.x);
        y0 = Math.min(y0, v.y);
        y1 = Math.max(y1, v.y);
      }
      const halfW = Math.tan((this.fov * Math.PI) / 360) * dist * aspect;
      target.x += ((x0 + x1) / 2) * halfW * 0.6;
      target.z -= ((y0 + y1) / 2) * (halfW / aspect) * 0.6;
      const need = Math.max((x1 - x0) / 2, (y1 - y0) / 2);
      dist *= 1 + (need - 0.995) * 0.7;
    }
    const previousPlay = this.play;
    this.play = {
      pos: target.clone().addScaledVector(dir, dist),
      look: target.clone(),
      fov: this.fov,
    };
    if (this.to === previousPlay) this.to = this.play;
    this.camera.aspect = aspect;
    if (!this.started) {
      this.started = true;
      this.copy(this.cur, this.mode === 'title' ? TITLE_POSE : this.play);
    } else if (!this.shots && !this.reel && !this.to && !this.hold && this.mode === 'play') {
      this.copy(this.cur, this.rest());
    }
    this.poseVersion++;
  }

  private copy(a: Pose, b: Pose): void {
    a.pos.copy(b.pos);
    a.look.copy(b.look);
    a.fov = b.fov;
  }

  setMode(mode: 'play' | 'title', seconds = 2.6): void {
    if (mode === this.mode && !this.shots && !this.reel) return;
    this.mode = mode;
    this.shots = null;
    this.reel = null;
    this.moveTo(this.rest(), seconds);
  }

  snap(mode: 'play' | 'title'): void {
    this.mode = mode;
    this.shots = null;
    this.reel = null;
    this.to = null;
    this.copy(this.cur, this.rest());
    this.poseVersion++;
  }

  pose(p: Pose): void {
    this.shots = null;
    this.reel = null;
    this.to = null;
    this.hold = true;
    this.copy(this.cur, p);
    this.poseVersion++;
  }
  private hold = false;
  release(): void {
    this.hold = false;
  }

  private moveTo(p: Pose, seconds: number): void {
    this.copy(this.from, this.cur);
    this.to = p;
    this.t = 0;
    this.dur = seconds;
  }

  cutscene(shots: Shot[], done?: () => void): void {
    this.hold = false;
    this.shots = shots;
    this.reel = null;
    this.shotT = 0;
    this.after = done ?? null;
    this.to = null;
  }

  /** Runs a live camera move and lands in the gameplay view (overhead, or the focus if one is set) when it is over. */
  film(reel: Reel, done?: () => void): void {
    this.hold = false;
    this.mode = 'play';
    this.shots = null;
    this.reel = reel;
    this.shotT = 0;
    this.after = done ?? null;
    this.to = null;
  }

  skip(): void {
    if (!this.shots && !this.reel) return;
    this.shots = null;
    this.reel = null;
    this.moveTo(this.rest(), 1.6);
    this.after?.();
    this.after = null;
  }

  update(dt: number, shake: number): void {
    let want = 1;
    if (this.reel) {
      this.shotT += dt;
      if (!this.reel(this.shotT, this.cur)) {
        this.reel = null;
        this.moveTo(this.rest(), 1.4);
        this.after?.();
        this.after = null;
      }
    } else if (this.shots) {
      const t0 = this.shotT;
      this.shotT += dt;
      const s = this.shots;
      const last = s[s.length - 1];
      for (const q of s) {
        if (q.at > this.shotT) break;
        if (q.speed !== undefined) want = q.speed;
        if (q.cue && q.at >= t0) this.onCue?.(q.cue);
      }
      if (this.shotT >= last.at + 0.5) {
        this.shots = null;
        this.moveTo(this.rest(), 3.2);
        this.after?.();
        this.after = null;
      } else {
        this.sampleShots(this.shotT);
      }
    } else if (this.to) {
      this.t = Math.min(1, this.t + dt / this.dur);
      const k = this.t < 0.5 ? 4 * this.t ** 3 : 1 - Math.pow(-2 * this.t + 2, 3) / 2;
      this.cur.pos.lerpVectors(this.from.pos, this.to.pos, k);
      this.cur.look.lerpVectors(this.from.look, this.to.look, k);
      this.cur.fov = lerp(this.from.fov, this.to.fov, k);
      if (this.t >= 1) {
        this.copy(this.cur, this.to);
        this.to = null;
        this.poseVersion++;
      }
    } else if (!this.hold) {
      const tgt = this.rest();
      if (this.cur.pos.distanceToSquared(tgt.pos) < 1e-4 && this.cur.look.distanceToSquared(tgt.look) < 1e-4) {
        this.copy(this.cur, tgt);
      } else {
        const k = 1 - Math.exp(-dt * 6);
        this.cur.pos.lerp(tgt.pos, k);
        this.cur.look.lerp(tgt.look, k);
        this.cur.fov = lerp(this.cur.fov, tgt.fov, k);
      }
    }

    this.speed += (want - this.speed) * (1 - Math.exp(-dt * 7));

    const cam = this.camera;
    this.px += (this.parallaxX - this.px) * Math.min(1, dt * 2.4);
    this.py += (this.parallaxY - this.py) * Math.min(1, dt * 2.4);
    cam.position.copy(this.cur.pos);
    // a filmed move is framed by hand, so the pointer does not get to nudge it
    const amt = this.hold || this.reel ? 0 : this.mode === 'title' ? 0.5 : 0.9;
    let sx = 0;
    let sy = 0;
    if (shake > 0.05) {
      this.shakeT += dt;
      const s = shake * 0.05;
      sx = Math.sin(this.shakeT * 71) * s + Math.sin(this.shakeT * 113) * s * 0.5;
      sy = Math.sin(this.shakeT * 89 + 1) * s;
    }
    if (this.use2DShift && !this.hold) {
      // Translate subtle parallax and shake into a 2D post UV shift so the 3D frustum stays locked.
      const ox = clamp((this.px * amt + sx) * 0.0045, -0.006, 0.006);
      const oy = clamp((-this.py * amt * 0.5 + sy) * 0.0045, -0.005, 0.005);
      this.screenShift.set(ox, oy, 1.014);
    } else {
      this.screenShift.set(0, 0, 1);
      cam.position.x += this.px * amt + sx;
      cam.position.y += -this.py * amt * 0.5 + sy;
    }
    cam.fov = this.cur.fov;
    cam.lookAt(this.cur.look);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  private sampleShots(t: number): void {
    const s = this.shots!;
    let i = 0;
    for (let k = 1; k < s.length; k++) if (s[k].at <= t) i = k;
    const a = s[i];
    const b = s[i + 1];
    if (!b || b.cut) {
      this.copy(this.cur, a.pose);
      return;
    }
    // a take ends at a cut, so the curve never looks past one
    const prev = i > 0 && !a.cut ? s[i - 1].pose : a.pose;
    const next = i + 2 < s.length && !s[i + 2].cut ? s[i + 2].pose : b.pose;
    const x = (t - a.at) / (b.at - a.at);
    const u = smooth(0, 1, x);
    const k = lerp(u, x, 0.6);
    catmull(this.cur.pos, prev.pos, a.pose.pos, b.pose.pos, next.pos, k);
    catmull(this.cur.look, prev.look, a.pose.look, b.pose.look, next.look, k);
    this.cur.fov = lerp(a.pose.fov, b.pose.fov, u);
  }
}

function catmull(out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, t: number): void {
  const t2 = t * t;
  const t3 = t2 * t;
  for (const k of ['x', 'y', 'z'] as const) {
    out[k] =
      0.5 * (2 * b[k] + (c[k] - a[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3);
  }
}

