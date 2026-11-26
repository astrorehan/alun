import { execFile } from 'node:child_process';
import { copyFile, mkdir, readdir, rm, stat, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

/**
 * Bu Sari's exclamations: short sounds in her own designed voice (scripts/voice-cast.json, made
 * by scripts/design-voice.mjs) that open each line of her scenes, picked by the line's mood.
 * Her lines are not read aloud, so the text can change without recording anything again.
 *
 *   npm run generate:voice              clips not made yet
 *   npm run generate:voice -- --dry     list what would be made, spend nothing
 *   npm run generate:voice -- --force   make every clip again
 *   npm run generate:voice -- --process redo only the ffmpeg pass from the kept takes
 *
 * Takes are kept in scripts/.voice-raw so the sound can be reworked without paying again.
 * Finished clips go to public/audio/voice/ with a manifest the game reads.
 */

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const RAW_DIR = path.join(here, '.voice-raw');
const OUT_DIR = path.join(ROOT, 'public', 'audio', 'voice');
const CAST_FILE = path.join(here, 'voice-cast.json');
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE ?? 'ffprobe';
const MODEL_ID = 'eleven_v3';

/** Per speaker and mood (see Mood in src/story/talk.ts), a few takes to pick from. */
const MUMBLES = {
  'BU SARI': {
    file: 'sari',
    moods: {
      ngobrol: ['Nah, nah... hmm.', 'Hmm, iyo, iyo...', 'Jadi... cak ini, ha.'],
      senang: ['[laughs] Hehehe! Nah, nah, nah!', '[laughs] Haha! Iyo, iyo!'],
      kaget: ['[surprised] Eh! Eh, eh, eh... alamak!', '[surprised] Hah?! Eh, eh!'],
      cemas: ['[nervous] Aduh, aduh, aduh...', '[nervous] Waduh... waduh, waduh.'],
      teriak: ['[shouting] Hoi! Hoi!', '[shouting] Awas! Hei!'],
      bisik: ['[whispers] Ssst... hmm...'],
      lega: ['[sighs] Haaah...'],
      sedih: ['[sad] Yaa ampun...'],
    },
  },
};

/** FNV-1a over UTF-16 units: names a kept take by voice and words. */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

async function exists(p) {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
}

async function tts(voice, text) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: { stability: 0.5 } }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Silence trimmed from both ends, rumble cut, and every take brought to the same loudness. */
async function processTake(raw, out) {
  const trim = [
    'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02',
    'areverse',
    'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08',
    'areverse',
    'highpass=f=70',
  ].join(',');
  // too short for loudnorm to measure well: level by average loudness, never past -1.5 dB peak
  const { stderr } = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', raw, '-af', `${trim},volumedetect`, '-f', 'null', '-']);
  const mean = Number(/mean_volume: (-?[\d.]+) dB/.exec(stderr)?.[1] ?? -20);
  const peak = Number(/max_volume: (-?[\d.]+) dB/.exec(stderr)?.[1] ?? -3);
  const gain = Math.min(-19 - mean, -1.5 - peak);
  await run(FFMPEG, ['-hide_banner', '-y', '-i', raw, '-af', `${trim},volume=${gain.toFixed(2)}dB`, '-ac', '1', '-ar', '44100', '-b:a', '96k', out]);
  const probe = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]);
  return Math.round(Number(probe.stdout.trim()) * 100) / 100;
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const force = args.includes('--force');
const processOnly = args.includes('--process');

let cast = {};
try {
  cast = JSON.parse(await readFile(CAST_FILE, 'utf8'));
} catch {}

await mkdir(RAW_DIR, { recursive: true });
await mkdir(OUT_DIR, { recursive: true });

const jobs = [];
for (const [sender, { file, moods }] of Object.entries(MUMBLES)) {
  const voice = cast[sender]?.voice;
  for (const [mood, texts] of Object.entries(moods)) {
    texts.forEach((text, i) => {
      const raw = path.join(RAW_DIR, `mumble-${hash(`${voice}\u0001${text}`)}.mp3`);
      jobs.push({ sender, voice, mood, text, raw, name: `${file}-${mood}-${i + 1}.mp3` });
    });
  }
}

const todo = [];
for (const j of jobs) if (force || !(await exists(j.raw))) todo.push(j);
const chars = todo.reduce((n, j) => n + j.text.length, 0);
console.log(`${jobs.length} seruan, ${processOnly ? 'diolah ulang dari rekaman yang ada' : `${todo.length} perlu direkam (${chars} karakter)`}.`);
if (!processOnly) for (const j of todo) console.log(`  ${j.name}  ${j.text}`);
if (dry) process.exit(0);

if (!processOnly) {
  for (const j of todo) {
    if (!j.voice) throw new Error(`Belum ada suara untuk ${j.sender}: jalankan scripts/design-voice.mjs --keep <id>`);
    console.log(`[tts] ${j.name}`);
    await writeFile(j.raw, await tts(j.voice, j.text));
  }
}

const manifest = { version: 3, mumbles: {} };
for (const j of jobs) {
  if (!(await exists(j.raw))) continue;
  const d = await processTake(j.raw, path.join(OUT_DIR, j.name));
  const bySender = (manifest.mumbles[j.sender] ??= {});
  (bySender[j.mood] ??= []).push({ f: j.name, d });
}

// anything else in the folder belongs to an older way of doing voices
const keep = new Set(jobs.map((j) => j.name));
for (const f of await readdir(OUT_DIR)) {
  if (f.endsWith('.mp3') && !keep.has(f)) await rm(path.join(OUT_DIR, f));
}
await writeFile(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`Selesai: ${jobs.length} seruan di public/audio/voice.`);
