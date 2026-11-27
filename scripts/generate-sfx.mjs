import { execFile } from 'node:child_process';
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

/**
 * Every sound effect in ALUN comes from ElevenLabs text-to-sound. Nothing is synthesized in code.
 *
 *   npm run generate:sfx                       make one take for each sound that has none, then build
 *   npm run generate:sfx -- --dry              list what would be made, spend nothing
 *   npm run generate:sfx -- --takes 3 id ...   make three more takes of these sounds
 *   npm run generate:sfx -- --process          rebuild public/audio from the kept takes, spend nothing
 *   npm run generate:sfx -- --audition id ...  render every take of these sounds (and their demos)
 *                                              to scripts/.sfx-audition for listening
 *
 * Takes are kept in scripts/.sfx-raw/<id>/<n>.mp3; `pick` says which one the game uses. Take 0 is
 * the file that was in public/audio before takes were kept; it goes back in as it was, or with only
 * the quiet lead-in cut when `tidy` is set. A new take is cut to its sound (no silence before the
 * hit), faded, made mono and brought to one loudness, so the volumes in src/audio.ts mean the same
 * thing for every new sound. Loops are copied as they are.
 */

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const RAW_DIR = path.join(here, '.sfx-raw');
const AUDITION_DIR = path.join(here, '.sfx-audition');
const OUT_DIR = path.join(ROOT, 'public', 'audio');
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const MODEL_ID = 'eleven_text_to_sound_v3';
const SR = 44100;

/** Loudness of the sounding part of a one-shot, and the highest its peak may go. */
const TARGET_RMS_DB = -19;
const PEAK_CAP_DB = -1;

/**
 * id: file name in public/audio. text, dur (seconds, 0.5..30), infl (prompt influence), loop: the
 * request. pick: take used. cut: [start, length] of the take kept before anything else. max: the
 * longest the sound may run. fade: fade-out length. gain: dB on top of the common loudness.
 */
export const SOUNDS = [
  /* ---------------------------------------------------------------- sea and weather (loops) */
  { id: 'ocean-ambience', loop: true, pick: 0, dur: 10, infl: 0.55, text: 'Gentle tropical turquoise lagoon waves softly lapping and receding on a warm sandy Indonesian beach, peaceful coastal surf ambience, clean natural ocean water, no voices, no birds' },
  { id: 'rain-monsoon', loop: true, pick: 0, dur: 10, infl: 0.55, text: 'Steady tropical monsoon rain falling heavily onto ocean water and wide palm leaves, rich natural coastal rainfall texture, continuous steady downpour, no thunder, no voices' },
  { id: 'storm-wind', loop: true, pick: 0, dur: 8, infl: 0.5, text: 'Warm coastal tropical ocean breeze and monsoon wind rustling gently through palm fronds across open water, smooth airy atmospheric wind texture, no harsh whistling' },
  { id: 'wave-charge', loop: true, pick: 0, dur: 3.5, infl: 0.55, text: 'Swirling underwater ocean tidal current building smooth rising energy hum, bubbling watery vortex charge loop, warm coastal magic tone' },
  { id: 'boat-motor', loop: true, pick: 1, dur: 4, infl: 0.6, text: 'Small outboard motor of a wooden fishing boat running steadily, two-stroke engine putter heard close up, constant even loop, no splashes, no music' },

  /* ---------------------------------------------------------------- weather one-shots */
  { id: 'thunder-1', pick: 0, dur: 4, infl: 0.6, text: 'Deep atmospheric distant tropical monsoon thunder rolling softly across an open ocean horizon, warm cinematic low rumble fading gently, no sudden harsh crack' },
  { id: 'thunder-2', pick: 0, dur: 3.6, infl: 0.6, text: 'Distant coastal thunderclap echoing smoothly over a rain-swept tropical sea, resonant deep low rolling storm rumble' },
  { id: 'weather-shift', pick: 0, dur: 2.2, infl: 0.6, gain: -6, text: 'Soft warm tropical coastal breeze swell with delicate hollow bamboo wind chimes gently tinkling in the distance, serene atmospheric transition' },

  /* ---------------------------------------------------------------- the wave */
  { id: 'wave-light', pick: 0, tidy: true, dur: 0.8, infl: 0.7, text: 'A quick swoosh of seawater flung forward by hand, short splashy whoosh with a spray of droplets, close up, one-shot, no music' },
  { id: 'wave-heavy', pick: 0, dur: 1.4, infl: 0.7, text: 'A big surge of ocean water hurled forward, heavy deep whoosh that crashes into a foaming splash, close up, one-shot, no music' },
  { id: 'wave-echo', pick: 0, dur: 0.9, infl: 0.65, gain: -5, text: 'Soft shimmering secondary water ripple and delicate splashing wave wash trailing across calm tropical sea, airy crisp water echo' },
  { id: 'charge-full', pick: 2, dur: 0.8, infl: 0.75, max: 0.7, gain: -3, text: 'A bright sparkling chime ping with a shimmer, magical power fully charged cue for a game, clean, one-shot' },
  { id: 'wave-hit', pick: 3, dur: 0.5, infl: 0.75, max: 0.4, text: 'A wave of water slapping into a floating plastic bottle, short wet splashy thwack, close up, one-shot' },
  { id: 'shore-splash', pick: 0, dur: 1, infl: 0.65, text: 'Foamy ocean wave crest washing and fizzing softly onto wet sandy beach shoreline, crisp natural coastal surf splash' },
  { id: 'splash', pick: 0, dur: 0.8, infl: 0.7, text: 'Natural crisp object splashing into clear tropical seawater with a lively bubbly plop and spray' },

  /* ---------------------------------------------------------------- the net and its pay */
  { id: 'net-catch-1', pick: 1, dur: 0.5, infl: 0.75, max: 0.45, text: 'A small floating bottle plopping into a wet rope net, quick bubbly water plop with a soft thud, close up, one-shot' },
  { id: 'net-catch-2', pick: 3, dur: 0.5, infl: 0.75, max: 0.45, text: 'A small floating bottle plopping into a wet rope net, quick bubbly water plop with a soft thud, close up, one-shot' },
  // every catch rings a coin, a step higher with each catch of a combo (the scale is in src/audio.ts)
  { id: 'coin', pick: 3, dur: 0.5, infl: 0.85, max: 0.4, fade: 0.12, text: 'One single gold coin ching, bright clean metallic ring with a short shimmer, like picking up a coin in a game, dry, one-shot' },
  { id: 'trash-rare', pick: 0, dur: 1.1, infl: 0.7, text: 'Crisp sparkling water scoop splash layered with a bright tropical wooden marimba and shimmering glass chime flourish, rewarding rare item pickup game SFX' },
  { id: 'trash-epic', pick: 0, dur: 1.4, infl: 0.7, text: 'Lush triumphant tropical marimba chord and golden sparkling bell shimmer over a lively water splash into a net, rewarding epic treasure collect game SFX' },
  { id: 'trash-legendary', pick: 0, dur: 1.8, infl: 0.68, text: 'Radiant magical tropical coastal fanfare with sparkling kalimba and harp arpeggio, warm golden shimmer and crisp water splash, unforgettable legendary discovery game SFX' },
  { id: 'combo-milestone', pick: 1, dur: 1.2, infl: 0.75, max: 1.1, text: 'A cheerful burst of gold coins jingling and spilling into a pile, bright jackpot reward sound for a game, one-shot' },
  { id: 'combo-break', pick: 0, dur: 0.7, infl: 0.72, text: 'Gentle soft descending two-note hollow bamboo wood tap and quiet water drop, calm non-harsh combo fade game sound effect' },

  /* ---------------------------------------------------------------- menus */
  { id: 'ui-click', pick: 0, dur: 0.5, infl: 0.95, text: 'A clean wooden button tap for a cozy island game menu, short bright knock with a soft pop, dry, nothing else.' },
  { id: 'ui-hover', pick: 0, dur: 0.5, infl: 0.95, text: 'One gentle soft bubble pop blip, very small and quiet, short and clean, like a cursor touching a cute game menu button. Dry, nothing else.' },
  { id: 'ui-tab', pick: 0, dur: 0.55, infl: 0.78, text: 'Light breezy two-tone wooden marimba slide click, delicate coastal tropical UI tab switch sound effect, short and airy' },
  { id: 'ui-open', pick: 0, dur: 0.5, infl: 0.85, text: 'Snappy cartoon game UI window pop-up sound, round bubbly pop with a tiny bright sparkle on top. Very short, clean, dry, no background.' },
  { id: 'ui-close', pick: 0, dur: 0.5, infl: 0.85, text: 'Clean game UI panel close sound: a quick soft downward swish ending in a gentle muted click. Short, dry, no ambience, no music.' },
  { id: 'ui-error', pick: 0, dur: 0.55, infl: 0.78, text: 'Soft muted low hollow wooden knock double thud, gentle non-jarring game UI denied or insufficient coins feedback sound' },
  { id: 'radio-in', pick: 0, dur: 0.5, infl: 0.85, text: 'Short handheld two-way radio push-to-talk squelch: a crisp click with a brief burst of radio static that cuts off cleanly. Very short, no voice.' },
  { id: 'radio-out', pick: 0, dur: 0.5, infl: 0.85, text: 'A walkie-talkie release: soft click with a tiny static tail, very short, no voice.' },
  { id: 'upgrade-buy', pick: 0, dur: 1.1, infl: 0.72, text: 'Satisfying bright tropical coin clink followed by a warm ascending wooden marimba two-note chime with gentle sparkle, rewarding upgrade purchase game SFX' },
  { id: 'shop-unlock', pick: 0, dur: 1.5, infl: 0.7, text: 'Bright welcoming tropical bamboo chime melody with gentle sparkling ocean bell shimmer, cheerful menu feature unlocked game jingle' },
  { id: 'achievement-claim', pick: 0, dur: 1.6, infl: 0.7, text: 'Joyful sparkling tropical coastal badge fanfare, bright ascending wooden marimba arpeggio with warm golden chime sparkle, celebratory achievement claim SFX' },

  /* ---------------------------------------------------------------- the radio's babble: one syllable each, pitched in the game */
  { id: 'blip-alun', pick: 1, dur: 0.5, infl: 0.85, max: 0.12, fade: 0.03, text: 'One tiny cute robot beep, a single short friendly electronic chirp, clean, no reverb' },
  { id: 'blip-low', pick: 1, dur: 0.5, infl: 0.85, max: 0.13, fade: 0.04, text: 'One single short low hollow wooden block knock, soft bop, dry, one-shot' },
  { id: 'blip-mid', pick: 1, dur: 0.5, infl: 0.85, max: 0.12, fade: 0.04, text: 'One single short soft marimba note tap, round and warm, dry, one-shot' },

  /* ---------------------------------------------------------------- story and lagoon */
  { id: 'toss', pick: 1, dur: 0.5, infl: 0.75, max: 0.45, gain: -4, text: 'A plastic bag of rubbish tossed through the air, quick short whoosh, close up, one-shot' },
  { id: 'alert', pick: 1, dur: 1, infl: 0.8, max: 1, text: 'Two descending marimba notes, a gentle but worried uh-oh alert cue for a cozy game, wooden, short, dry' },
  { id: 'alun-wake', pick: 1, dur: 1.6, infl: 0.7, max: 1.6, text: 'A friendly little sea robot powering on: soft rising electronic chime with cheerful bubbly beeps, warm and hopeful, clean' },
  { id: 'defeat', pick: 1, dur: 2.2, infl: 0.75, max: 2.2, text: 'A gentle sad descending marimba phrase of four notes, soft game over cue, warm and calm, dry' },
  { id: 'victory', pick: 0, dur: 3, infl: 0.65, text: 'Uplifting warm tropical sunrise victory fanfare with wooden marimba, bright kalimba arpeggio, and sparkling ocean chimes, joyful peaceful coastal triumph' },
  { id: 'dolphin-distress', pick: 3, dur: 1.8, infl: 0.75, max: 1.8, text: 'A bottlenose dolphin in distress: rapid squeaky whistles that rise and fall, frantic clicks and squeals, recorded just above the water, natural, no music' },
  { id: 'dolphin-happy', pick: 1, dur: 1.5, infl: 0.75, max: 1.5, text: 'A happy bottlenose dolphin chirping and whistling playfully at the surface, a bright burst of clicks and whistles, close, natural' },
  { id: 'pier-hit', pick: 1, dur: 0.9, infl: 0.75, max: 0.85, text: 'A heavy boat ramming a wooden pier, planks cracking and splintering with a deep wooden thud and a splash, close, one-shot' },
  { id: 'ship-hit', pick: 3, dur: 0.7, infl: 0.75, max: 0.65, text: 'A wave of seawater slamming into the hull of a wooden boat, hollow wooden thud with a heavy splash, close, one-shot' },
  { id: 'ship-sink', pick: 1, dur: 1.8, infl: 0.7, max: 1.8, text: 'A small wooden boat breaking apart and sinking, creaking cracking timber and a deep bubbling gurgle of water, one-shot' },
  { id: 'raid-horn', pick: 1, dur: 2.2, infl: 0.75, max: 2.2, gain: -2, text: 'A conch shell horn blown far out at sea, one long ominous note echoing over the water at night' },
  { id: 'trawler-hit', pick: 0, dur: 1, infl: 0.7, text: 'Heavy ocean wave slamming forcefully against a rusty steel ship hull, deep resonant metallic thud with splashing sea spray, impact game SFX' },
  { id: 'net-snap', pick: 0, tidy: true, dur: 0.9, infl: 0.7, text: 'Taut wet fishing rope net snapping and tearing free followed by a brisk ocean water splash' },
  { id: 'fire-douse', pick: 0, dur: 1.3, infl: 0.7, text: 'Crisp ocean water splash dousing flames with realistic sizzling steam hiss resolving into a clean bright relief chime' },
  { id: 'mangrove-plant', pick: 0, dur: 1.3, infl: 0.68, text: 'Organic lush green palm leaf rustle, soft sandy earth thump, and warm blooming wooden marimba chord, magical nature restoration game SFX' },
  { id: 'boat-saved', pick: 0, dur: 1.5, infl: 0.68, text: 'Warm wooden fishing boat gently bumping a timber pier followed by a cheerful maritime brass bell and bright tropical wooden chime, boat rescued game SFX' },
  { id: 'bird-tropical-1', pick: 0, dur: 1.4, infl: 0.7, text: 'Single brief cheerful Indonesian tropical coastal songbird melodic chirp in warm morning forest air, clean natural bird call, no background noise' },
  { id: 'bird-tropical-2', pick: 0, dur: 1.5, infl: 0.7, text: 'Gentle tropical island bird two-note flute-like whistle echoing softly from coastal palm trees, clean natural call, quiet background' },
  { id: 'seagull', pick: 0, dur: 1.5, infl: 0.7, text: 'Distant coastal seagull calling twice softly over a calm tropical ocean lagoon, natural seabird cry, clean recording' },
];

/** Listening files built from a sound the way the game plays it: pitched notes, babble runs. */
const DEMOS = {
  coin: () => ({
    name: 'coin-combo-run',
    // eight catches in a row: the net's plop under a coin climbing the D major pentatonic
    hits: [1, 1.1225, 1.2599, 1.4983, 1.6818, 2, 2.245, 2.5198].map((k, i) => ({ at: i * 0.32, rate: 0.82 * k, gain: 0.5 })),
    under: 'net-catch-1',
  }),
  'blip-alun': () => ({ name: 'blip-alun-babble', hits: babble(1, 0.7, 0.062) }),
  'blip-low': () => ({ name: 'blip-low-babble', hits: babble(0.8, 0.26, 0.085) }),
  'blip-mid': () => ({ name: 'blip-mid-babble', hits: babble(1, 0.32, 0.075) }),
};

function babble(pitch, spread, gap) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 16 }, (_, i) => ({ at: i * gap + (i % 5 === 4 ? 0.12 : 0) + Math.floor(i / 5) * 0.12, rate: pitch * (1 - spread / 2 + rnd() * spread), gain: 0.8 }));
}

/* ==================================================================== helpers */

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

const takePath = (id, n) => path.join(RAW_DIR, id, `${n}.mp3`);

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

async function generate(sound) {
  const res = await fetch(`https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: sound.text,
      model_id: MODEL_ID,
      duration_seconds: sound.dur,
      prompt_influence: sound.infl,
      loop: Boolean(sound.loop),
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The take as mono samples. */
async function decode(file, start = 0, length = 0) {
  const args = ['-v', 'error'];
  if (start > 0) args.push('-ss', String(start));
  if (length > 0) args.push('-t', String(length));
  args.push('-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-');
  const { stdout } = await run(FFMPEG, args, { encoding: 'buffer', maxBuffer: 1 << 28 });
  return new Float32Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 4);
}

const db = (v) => 20 * Math.log10(Math.max(1e-9, v));

/** Where the sound starts and ends, how loud it is while it sounds, and its peak. */
function measure(s) {
  const win = Math.round(SR * 0.004);
  const env = [];
  for (let i = 0; i < s.length; i += win) {
    let m = 0;
    for (let j = i; j < Math.min(s.length, i + win); j++) m = Math.max(m, Math.abs(s[j]));
    env.push(m);
  }
  const peak = Math.max(...env, 1e-9);
  const on = peak * 10 ** (-30 / 20);
  const off = peak * 10 ** (-48 / 20);
  const first = Math.max(0, env.findIndex((v) => v >= on));
  let last = env.length - 1;
  while (last > first && env[last] < off) last--;
  let sum = 0;
  let n = 0;
  env.forEach((v, i) => {
    if (v < on) return;
    for (let j = i * win; j < Math.min(s.length, (i + 1) * win); j++) {
      sum += s[j] * s[j];
      n++;
    }
  });
  return { start: (first * win) / SR, end: ((last + 1) * win) / SR, peakDb: db(peak), rmsDb: db(Math.sqrt(sum / Math.max(1, n))) };
}

/** One take, made ready for the game. Returns what was done, for the log. */
async function build(sound, raw, out, take = sound.pick ?? 0) {
  if (sound.loop || (take === 0 && !sound.tidy)) {
    await copyFile(raw, out);
    return 'as made';
  }
  const [cutStart, cutLen] = sound.cut ?? [0, 0];
  const s = await decode(raw, cutStart, cutLen);
  const m = measure(s);
  const start = cutStart + Math.max(0, m.start - 0.004);
  let length = m.end + 0.03 - Math.max(0, m.start - 0.004);
  if (sound.max) length = Math.min(length, sound.max);
  const fade = Math.min(length * 0.5, sound.fade ?? (length < 0.3 ? 0.04 : 0.12));
  const gain = take === 0 ? 0 : Math.min(TARGET_RMS_DB - m.rmsDb, PEAK_CAP_DB - m.peakDb) + (sound.gain ?? 0);
  const af = [
    'highpass=f=35',
    'afade=t=in:d=0.002',
    `afade=t=out:st=${Math.max(0, length - fade).toFixed(3)}:d=${fade.toFixed(3)}`,
    `volume=${gain.toFixed(2)}dB`,
  ].join(',');
  await run(FFMPEG, ['-v', 'error', '-y', '-ss', start.toFixed(4), '-t', length.toFixed(4), '-i', raw, '-af', af, '-ac', '1', '-ar', String(SR), '-c:a', 'libmp3lame', '-b:a', '112k', out]);
  return `start ${start.toFixed(3)}s, ${length.toFixed(2)}s long, ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB`;
}

/** Lays pitched copies of a built sound on a timeline, the way the game would play them. */
async function renderDemo(file, demo, out, underFile) {
  const inputs = [];
  const parts = [];
  demo.hits.forEach((h, i) => {
    inputs.push('-i', file);
    parts.push(`[${i}:a]asetrate=${Math.round(SR * h.rate)},aresample=${SR},volume=${h.gain},adelay=${Math.round(h.at * 1000)}|${Math.round(h.at * 1000)}[h${i}]`);
  });
  let n = demo.hits.length;
  if (underFile) {
    demo.hits.forEach((h, i) => {
      inputs.push('-i', underFile);
      parts.push(`[${n + i}:a]volume=0.7,adelay=${Math.round(h.at * 1000)}|${Math.round(h.at * 1000)}[u${i}]`);
    });
  }
  const labels = demo.hits.map((_, i) => `[h${i}]`).join('') + (underFile ? demo.hits.map((_, i) => `[u${i}]`).join('') : '');
  n = demo.hits.length * (underFile ? 2 : 1);
  parts.push(`${labels}amix=inputs=${n}:normalize=0,alimiter=limit=0.9[out]`);
  await run(FFMPEG, ['-v', 'error', '-y', ...inputs, '-filter_complex', parts.join(';'), '-map', '[out]', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '128k', out]);
}

/* ==================================================================== main */

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const takesArg = args.indexOf('--takes');
const extra = takesArg >= 0 ? Number(args[takesArg + 1]) : 0;
const ids = args.filter((a, i) => !a.startsWith('--') && !(takesArg >= 0 && i === takesArg + 1));
const unknown = ids.filter((id) => !SOUNDS.some((s) => s.id === id));
if (unknown.length) {
  console.error(`Tidak dikenal: ${unknown.join(', ')}`);
  process.exit(1);
}
const chosen = ids.length ? SOUNDS.filter((s) => ids.includes(s.id)) : SOUNDS;

await mkdir(RAW_DIR, { recursive: true });

// the files made before takes were kept become take 0, once
for (const s of SOUNDS) {
  const pub = path.join(OUT_DIR, `${s.id}.mp3`);
  if (!(await exists(takePath(s.id, 0))) && (await exists(pub)) && (await takesOf(s.id)).length === 0) {
    await mkdir(path.join(RAW_DIR, s.id), { recursive: true });
    await copyFile(pub, takePath(s.id, 0));
  }
}

/* what to record */
const todo = [];
for (const s of chosen) {
  const have = await takesOf(s.id);
  const fresh = have.filter((n) => n > 0);
  const want = extra > 0 ? extra : flag('--audition') || flag('--process') ? 0 : s.pick > 0 && !fresh.includes(s.pick) ? 1 : 0;
  let next = Math.max(0, ...have) + 1;
  for (let k = 0; k < want; k++) todo.push({ s, n: next++ });
}
const seconds = todo.reduce((t, j) => t + (j.s.dur ?? 2), 0);
console.log(`${todo.length} take baru (${seconds.toFixed(1)} detik audio).`);
for (const j of todo) console.log(`  ${j.s.id} #${j.n}  (${j.s.dur}s)`);
if (flag('--dry')) process.exit(0);

if (todo.length) {
  const before = await credits();
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const j = todo[next++];
      try {
        await mkdir(path.join(RAW_DIR, j.s.id), { recursive: true });
        await writeFile(takePath(j.s.id, j.n), await generate(j.s));
        console.log(`[ok]  ${j.s.id} #${j.n}`);
      } catch (err) {
        failed++;
        console.error(`[err] ${j.s.id} #${j.n}: ${err?.message ?? err}`);
      }
    }
  };
  // the Starter plan takes four requests at a time
  await Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker));
  const after = await credits();
  if (before && after) console.log(`Kredit terpakai: ${after.used - before.used} (sisa ${after.limit - after.used}).`);
  if (failed) console.error(`${failed} gagal; jalankan lagi untuk mengulang.`);
}

/* listening files */
if (flag('--audition')) {
  await mkdir(AUDITION_DIR, { recursive: true });
  for (const s of chosen) {
    for (const n of await takesOf(s.id)) {
      const out = path.join(AUDITION_DIR, `${s.id}-take${n}.mp3`);
      console.log(`[dengar] ${path.basename(out)}  ${await build(s, takePath(s.id, n), out, n)}`);
      const demoOf = DEMOS[s.id];
      if (!demoOf) continue;
      const demo = demoOf();
      // under it, the newest take of that sound heard so far, else the one in the game
      let under = null;
      if (demo.under) {
        const heard = (await takesOf(demo.under)).filter((k) => k > 0).pop();
        const file = heard ? path.join(AUDITION_DIR, `${demo.under}-take${heard}.mp3`) : '';
        under = heard && (await exists(file)) ? file : path.join(OUT_DIR, `${demo.under}.mp3`);
      }
      const dout = path.join(AUDITION_DIR, `${demo.name}-take${n}.mp3`);
      await renderDemo(out, demo, dout, under);
      console.log(`[dengar] ${path.basename(dout)}`);
    }
  }
  process.exit(0);
}

/* the game's files: a run that only adds takes leaves them alone, so they can be heard first */
if (extra > 0) {
  console.log('Take baru disimpan. Dengarkan dengan --audition, pilih lewat `pick`, lalu --process.');
  process.exit(0);
}
for (const s of chosen) {
  const raw = takePath(s.id, s.pick ?? 0);
  if (!(await exists(raw))) {
    console.log(`[lewat] ${s.id}: take #${s.pick ?? 0} belum ada`);
    continue;
  }
  const out = path.join(OUT_DIR, `${s.id}.mp3`);
  console.log(`[siap]  ${s.id}.mp3  ${await build(s, raw, out)}`);
}
