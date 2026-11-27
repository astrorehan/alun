import * as THREE from 'three';
import { Build } from './build';
import { outlineMaterial, toon } from './gfx';
import { inked, mesh } from './kit';
import { groundAt, rng } from './space';
import { propPair } from './village';

/**
 * The beach's name on a board at the top of the sand, just south of the village: "PANTAI PANJANG",
 * facing the sea and the bay the opening starts from. A wooden board on two posts under a little gable,
 * lettered like the village net's sign.
 */

/** Where it stands, and which way the board faces (towards the sea and the title's camera). */
export const SIGN_AT = { x: -45.2, z: 20.6, yaw: 1.37, scale: 1.2 };

const POST = '#6b4a2e';
const CAP = '#a8743e';

function lettering(onFontReady?: () => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 360;
  const g = c.getContext('2d')!;
  const draw = (): void => {
    const r = rng(9);
    const planks = ['#a86a3a', '#b87844', '#9c6034', '#b27040', '#a96b3b'];
    for (let i = 0; i < 5; i++) {
      g.fillStyle = planks[i];
      g.fillRect(0, i * 72, 1024, 72);
      g.strokeStyle = 'rgba(60,30,12,.26)';
      g.lineWidth = 2;
      for (let k = 0; k < 7; k++) {
        const y = i * 72 + r() * 70;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= 1024; x += 64) g.lineTo(x, y + Math.sin(x * 0.02 + k) * 3);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,18,6,.55)';
      g.fillRect(0, i * 72 + 69, 1024, 4);
    }
    g.strokeStyle = '#ffe9bd';
    g.lineWidth = 9;
    g.strokeRect(20, 20, 984, 320);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const say = (text: string, y: number, px: number, max: number): void => {
      g.font = `800 ${px}px Fredoka, "Baloo 2", "Trebuchet MS", sans-serif`;
      g.fillStyle = 'rgba(50,20,6,.75)';
      g.fillText(text, 516, y + 6, max);
      g.fillStyle = '#fff3d6';
      g.fillText(text, 512, y, max);
    };
    say('SELAMAT DATANG DI', 88, 58, 760);
    say('PANTAI PANJANG', 214, 142, 930);
    // a little wave under the name
    g.strokeStyle = '#7fe0e8';
    g.lineWidth = 8;
    g.lineCap = 'round';
    g.beginPath();
    for (let x = 300; x <= 724; x += 4) {
      const y = 300 + Math.sin((x - 300) * 0.045) * 9;
      if (x === 300) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  };
  draw();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  document.fonts
    ?.load('800 142px Fredoka')
    .then(() => {
      draw();
      t.needsUpdate = true;
      onFontReady?.();
    })
    .catch(() => {});
  return t;
}

export class BeachSign {
  readonly group = new THREE.Group();

  /** `onReady` runs when the lettering has been redrawn in the game's own font: cached views need redrawing. */
  constructor(onReady?: () => void) {
    const { x, z, yaw, scale } = SIGN_AT;
    const gy = groundAt(x, z);
    const ink = outlineMaterial(1.35, '#33190f', { isStatic: true });

    // the frame: two posts sunk in the sand and a little gable over the board, in the sign's own space
    const b = new Build(81);
    for (const s of [-1, 1]) {
      b.box(0.24, 3.9, 0.24, { color: POST, pos: [s * 2.55, 1.55, 0], r: 0.04 });
      b.box(0.36, 0.3, 0.36, { color: '#4e3420', pos: [s * 2.55, -0.25, 0], r: 0.05 });
    }
    b.box(5.5, 0.16, 0.3, { color: POST, pos: [0, 1.02, 0], r: 0.03 });
    for (const s of [-1, 1]) b.box(3.15, 0.14, 0.62, { color: CAP, pos: [s * 1.42, 3.82, 0], rot: [0, 0, -s * 0.3], r: 0.03 });
    b.ball(0.13, { color: '#f2c14e', pos: [0, 4.3, 0], seg: 8, gloss: 0.5 });
    const frame = inked(mesh(b.geo(true), propPair(THREE.FrontSide, true)), ink);

    // the board, lettered on both faces
    const pair = toon({
      isStatic: true,
      uniforms: { tSign: { value: lettering(onReady) } },
      fHead: 'uniform sampler2D tSign;',
      fAlbedo: 'alb = texture2D(tSign, vUv2).rgb;',
    });
    const board = inked(mesh(new Build(83).add(new THREE.BoxGeometry(4.8, 1.69, 0.14), { color: '#ffffff' }).geo(true), pair), ink);
    board.position.set(0, 2.35, 0);

    for (const m of [frame, board]) {
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.group.position.set(x, gy, z);
    this.group.rotation.y = yaw;
    this.group.scale.setScalar(scale);
  }
}
