import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

/**
 * ALUN's background music, made with ElevenLabs Music. One track per mood of the lagoon.
 *
 *   npm run generate:music -- --dry            list what would be made, spend nothing
 *   npm run generate:music -- --sample day     one short take of a track, to hear before the rest
 *   npm run generate:music -- day night ...    full takes of these tracks (all when none are named)
 *   npm run generate:music -- --process        rebuild public/audio/music from the kept takes
 *
 * Takes are kept in scripts/.music-raw/<id>/<n>.mp3; `pick` says which one the game uses.
 */

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const RAW_DIR = path.join(here, '.music-raw');
const OUT_DIR = path.join(ROOT, 'public', 'audio', 'music');
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const MODEL_ID = 'music_v2_5';
const SAMPLE_MS = 30000;

/** What every track shares, so the moods sound like one game. */
const BASE =
  'Instrumental background music for a cozy tropical game set in a fishing village on the coast of Sumatra, Indonesia. ' +
  'Steady energy with no big build-up, no intro and no ending, so it can loop seamlessly under gameplay. No vocals.';

/** Morning, noon and the title share `day`; the game picks a track from the time of day (src/audio.ts). */
export const TRACKS = [
  {
    id: 'day',
    pick: 1,
    ms: 120000,
    text:
      'Warm, sunny, relaxed and hopeful. Bamboo angklung and marimba carry a simple catchy melody, a soft suling bamboo flute answers, ' +
      'gentle kendang hand drums and shaker keep a light island groove, warm acoustic guitar and a round bass underneath. 96 BPM, D major.',
  },
  {
    id: 'sunset',
    pick: 1,
    ms: 90000,
    text:
      'Golden hour as the day ends: mellow, warm and a little wistful. Soft marimba and angklung chords, a slow singing suling bamboo flute melody, ' +
      'brushed hand percussion and a gentle acoustic guitar, sparse and calm. 84 BPM, D major.',
  },
  {
    id: 'night',
    pick: 1,
    ms: 90000,
    text:
      'Night on the dark lagoon while pirate boats creep in: calm on the surface but tense and eerie underneath. A low kendang drum pulse like a heartbeat, ' +
      'a dark ocean drone, breathy suling bamboo flute phrases, glassy metallophone chimes like glowing plankton. Mysterious, never loud. 90 BPM, D minor.',
  },
  {
    id: 'storm',
    pick: 1,
    ms: 90000,
    text:
      'Monsoon storm battle against a giant pirate mother ship: urgent and driving. Pounding kendang war drums and gongs, a deep bass ostinato, ' +
      'fast angklung and metallophone patterns, dramatic but still bright enough for a cozy game. 120 BPM, D minor, phrygian colour.',
  },
];

async function exists(p) {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
}

async function takesOf(id) {
  try {
    return (await readdir(path.join(RAW_DIR, id)))
      .map((f) => /^(\d+)\.mp3$/.exec(f)?.[1])
      .filter((n) => n !== undefined)
      .map(Number)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

async function credits() {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '' } });
    if (!res.ok) return null;
    const s = await res.json();
    return { used: s.character_count, limit: s.character_limit };
  } catch {
    return null;
  }
}

async function compose(track, ms) {
  const res = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: `${BASE} ${track.text}`, music_length_ms: ms, model_id: MODEL_ID, force_instrumental: true }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 400)}`);
  return Buffer.from(await res.arrayBuffer());
}

/* ==================================================================== loop points */

const SR = 44100;
const FSR = 11025;
const HOP = 512;
const NFFT = 1024;
const BANDS = 20;
/** Seconds of music after each point that must sound alike for the jump to pass unheard. */
const MATCH_S = 4;
const XFADE_S = 0.12;

async function decode(file, rate, channels) {
  const { stdout } = await run(FFMPEG, ['-v', 'error', '-i', file, '-ac', String(channels), '-ar', String(rate), '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 1 << 30 });
  return new Float32Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength));
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(a * k);
        const s = Math.sin(a * k);
        const xr = re[i + k + len / 2] * c - im[i + k + len / 2] * s;
        const xi = re[i + k + len / 2] * s + im[i + k + len / 2] * c;
        re[i + k + len / 2] = re[i + k] - xr;
        im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr;
        im[i + k] += xi;
      }
    }
  }
}

/** Log energy in a few bands per frame: what the music is doing at each moment, roughly. */
function features(s) {
  const frames = Math.floor((s.length - NFFT) / HOP);
  const edges = Array.from({ length: BANDS + 1 }, (_, b) => Math.round((60 * Math.pow(5000 / 60, b / BANDS) * NFFT) / FSR));
  const out = new Float32Array(frames * BANDS);
  const re = new Float64Array(NFFT);
  const im = new Float64Array(NFFT);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < NFFT; i++) {
      re[i] = s[f * HOP + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / NFFT));
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < BANDS; b++) {
      let e = 1e-9;
      for (let k = edges[b]; k < Math.max(edges[b] + 1, edges[b + 1]); k++) e += re[k] * re[k] + im[k] * im[k];
      out[f * BANDS + b] = Math.log(e);
    }
  }
  return { out, frames };
}

/**
 * Where to jump back to and from: the music after `end` must match the music after `start`, so
 * playing on from `start` once `end` is reached sounds like the piece just carrying on.
 */
function findLoop(mono) {
  const { out, frames } = features(mono);
  const fps = FSR / HOP;
  const W = Math.round(MATCH_S * fps);
  const L = frames;
  // frame loudness, to keep the jump out of any fade at the end
  const level = new Float32Array(L);
  for (let f = 0; f < L; f++) {
    let e = 0;
    for (let b = 0; b < BANDS; b++) e += Math.exp(out[f * BANDS + b]);
    level[f] = Math.log(e);
  }
  const sorted = [...level].sort((a, b) => a - b);
  const median = sorted[Math.floor(L / 2)];
  // each frame centred, so a match is about shape rather than overall loudness
  const z = new Float32Array(out.length);
  for (let f = 0; f < L; f++) {
    let m = 0;
    for (let b = 0; b < BANDS; b++) m += out[f * BANDS + b];
    m /= BANDS;
    for (let b = 0; b < BANDS; b++) z[f * BANDS + b] = out[f * BANDS + b] - m;
  }
  const score = (a, e) => {
    let dot = 0;
    let na = 0;
    let ne = 0;
    for (let i = 0; i < W * BANDS; i++) {
      const x = z[a * BANDS + i];
      const y = z[e * BANDS + i];
      dot += x * y;
      na += x * x;
      ne += y * y;
    }
    return dot / Math.sqrt(na * ne || 1);
  };
  const s0 = Math.round(2 * fps);
  const s1 = Math.round(L * 0.45);
  const e0 = Math.round(L * 0.55);
  const e1 = L - W - Math.round(1.5 * fps);
  let best = { s: s0, e: e1, v: -Infinity };
  const consider = (s, e) => {
    if (e - s < 20 * fps || level[e] < median - 1.2 || level[s] < median - 1.2) return;
    // a longer loop repeats less often
    const v = score(s, e) + 0.06 * ((e - s) / L);
    if (v > best.v) best = { s, e, v };
  };
  for (let s = s0; s <= s1; s += 3) for (let e = e0; e <= e1; e += 3) consider(s, e);
  const { s: cs, e: ce } = best;
  for (let s = cs - 3; s <= cs + 3; s++) for (let e = ce - 3; e <= ce + 3; e++) if (s >= 0 && e + W < L) consider(s, e);
  return { start: (best.s * HOP) / FSR, end: (best.e * HOP) / FSR, match: best.v };
}

/** Nudges `start` by up to a few milliseconds so the beats line up exactly with those after `end`. */
function alignBeats(mono, start, end) {
  const env = (t0) => {
    const n = Math.round(1.5 * FSR);
    const a = Math.round(t0 * FSR);
    const v = new Float32Array(n);
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const x = mono[a + i] ?? 0;
      v[i] = Math.abs(x - prev);
      prev = x;
    }
    return v;
  };
  const ref = env(end);
  let best = 0;
  let bestD = 0;
  const reach = Math.round(0.05 * FSR);
  for (let d = -reach; d <= reach; d++) {
    const v = env(start + d / FSR);
    let c = 0;
    for (let i = 0; i < ref.length; i++) c += ref[i] * v[i];
    if (c > best) {
      best = c;
      bestD = d;
    }
  }
  return start + bestD / FSR;
}

/**
 * Brought to one loudness so the music slider means the same for every track, with the last
 * moments before the loop's end blended into those before its start: the jump back is seamless.
 */
async function build(raw, out) {
  const mono = await decode(raw, FSR, 1);
  const found = findLoop(mono);
  const start = alignBeats(mono, found.start, found.end);
  const end = found.end;
  const pcm = await decode(raw, SR, 2);
  const x = Math.round(XFADE_S * SR);
  const si = Math.round(start * SR);
  const ei = Math.round(end * SR);
  for (let i = 0; i < x; i++) {
    const th = ((i + 1) / x) * (Math.PI / 2);
    const keep = Math.cos(th);
    const take = Math.sin(th);
    for (let c = 0; c < 2; c++) {
      const a = (ei - x + i) * 2 + c;
      const b = (si - x + i) * 2 + c;
      pcm[a] = pcm[a] * keep + pcm[b] * take;
    }
  }
  // nothing after the loop's end is ever played: the file stops just past it
  const keep = Math.min(pcm.length, (ei + Math.round(0.25 * SR)) * 2);
  const pcmFile = `${out}.f32`;
  await writeFile(pcmFile, Buffer.from(pcm.buffer, 0, keep * 4));
  const input = ['-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', pcmFile];
  const { stderr } = await run(FFMPEG, ['-hide_banner', '-nostats', ...input, '-af', 'loudnorm=I=-20:TP=-2:print_format=json', '-f', 'null', '-']);
  const from = stderr.lastIndexOf('{');
  const stats = JSON.parse(stderr.slice(from, stderr.indexOf('}', from) + 1));
  const gain = Math.min(-20 - Number(stats.input_i), -1.5 - Number(stats.input_tp));
  await run(FFMPEG, ['-v', 'error', '-y', ...input, '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'libmp3lame', '-b:a', '128k', out]);
  await rm(pcmFile);
  return { start: Math.round(start * 10000) / 10000, end: Math.round(end * 10000) / 10000, match: Math.round(found.match * 1000) / 1000, gain: Math.round(gain * 10) / 10 };
}

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const ids = args.filter((a) => !a.startsWith('--'));
const chosen = ids.length ? TRACKS.filter((t) => ids.includes(t.id)) : TRACKS;
const sample = flag('--sample');

if (flag('--process')) {
  await mkdir(OUT_DIR, { recursive: true });
  const loopsFile = path.join(OUT_DIR, 'loops.json');
  let loops = {};
  try {
    loops = JSON.parse(await readFile(loopsFile, 'utf8'));
  } catch {}
  for (const t of chosen) {
    const raw = path.join(RAW_DIR, t.id, `${t.pick}.mp3`);
    if (!(await exists(raw))) {
      console.log(`[lewat] ${t.id}: take #${t.pick} belum ada`);
      continue;
    }
    const info = await build(raw, path.join(OUT_DIR, `${t.id}.mp3`));
    loops[t.id] = { start: info.start, end: info.end };
    console.log(`[siap]  music/${t.id}.mp3  loop ${info.start}s → ${info.end}s (kecocokan ${info.match}), ${info.gain} dB`);
  }
  await writeFile(loopsFile, `${JSON.stringify(loops, null, 1)}\n`);
  process.exit(0);
}

const ms = (t) => (sample ? SAMPLE_MS : t.ms);
console.log(`${chosen.length} lagu, ${(chosen.reduce((a, t) => a + ms(t), 0) / 1000).toFixed(0)} detik.`);
if (flag('--dry')) process.exit(0);

const before = await credits();
for (const t of chosen) {
  await mkdir(path.join(RAW_DIR, t.id), { recursive: true });
  const n = Math.max(0, ...(await takesOf(t.id))) + 1;
  const name = sample ? `sample-${n}` : String(n);
  const file = path.join(RAW_DIR, t.id, `${name}.mp3`);
  console.log(`[musik] ${t.id} #${name} (${ms(t) / 1000} detik)...`);
  await writeFile(file, await compose(t, ms(t)));
  if (sample) {
    const audition = path.join(here, '.sfx-audition', `music-${t.id}-${name}.mp3`);
    await mkdir(path.dirname(audition), { recursive: true });
    await copyFile(file, audition);
    console.log(`[dengar] ${audition}`);
  }
}
const after = await credits();
if (before && after) console.log(`Kredit terpakai: ${after.used - before.used} (sisa ${after.limit - after.used}).`);
