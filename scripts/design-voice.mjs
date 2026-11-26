import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Bu Sari's own voice, designed from a description instead of picked from a library.
 *
 *   node --env-file=.env.local scripts/design-voice.mjs            three previews to listen to
 *   node --env-file=.env.local scripts/design-voice.mjs --seed 7   another three
 *   node --env-file=.env.local scripts/design-voice.mjs --keep <generated_voice_id>
 *
 * Previews land in scripts/.voice-design/. Keeping one saves it to the account and writes its id
 * to scripts/voice-cast.json, which `npm run generate:voice` reads.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(here, '.voice-design');
const CAST_FILE = path.join(here, 'voice-cast.json');
const API = 'https://api.elevenlabs.io/v1';
const KEY = process.env.ELEVENLABS_API_KEY ?? '';

const DESCRIPTION =
  'A warm, loud Indonesian woman in her late forties from the coast of Bengkulu, Sumatra. ' +
  'She speaks Indonesian with a Bengkulu Malay accent, fast and lively, her voice a little raspy from years of calling across a fishing harbour. ' +
  'Motherly, cheerful and slightly eccentric; she laughs easily in the middle of a sentence and talks to machines as if they were people. ' +
  'Natural and unpolished, like a real village mechanic talking into a handheld radio, never a narrator or an announcer.';

// Bu Sari's own first words, as the player will hear them.
const SAMPLE =
  '[surprised] Eh, eh... nyala nyo! [laughs] La tigo malam kuketok pakai kunci inggris, baru sekarang ndak bangun. ' +
  'Nah kau cubo klik di air, geser ke sampahnya, lepas.';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function call(route, body) {
  const res = await fetch(`${API}${route}`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const keep = flag('--keep');
if (keep) {
  const made = await call('/text-to-voice', {
    voice_name: 'ALUN Bu Sari',
    voice_description: DESCRIPTION,
    generated_voice_id: keep,
  });
  let cast = {};
  try {
    cast = JSON.parse(await readFile(CAST_FILE, 'utf8'));
  } catch {}
  cast['BU SARI'] = { voice: made.voice_id };
  await writeFile(CAST_FILE, `${JSON.stringify(cast, null, 2)}\n`);
  console.log(`Disimpan sebagai suara ${made.voice_id} di ${path.relative(process.cwd(), CAST_FILE)}`);
} else {
  const seed = Number(flag('--seed') ?? 1);
  const out = await call('/text-to-voice/design?output_format=mp3_44100_128', {
    voice_description: DESCRIPTION,
    model_id: 'eleven_ttv_v3',
    text: SAMPLE,
    seed,
    should_enhance: false,
  });
  await mkdir(OUT_DIR, { recursive: true });
  for (const [i, p] of out.previews.entries()) {
    const file = path.join(OUT_DIR, `sari-${seed}-${i + 1}-${p.generated_voice_id}.mp3`);
    await writeFile(file, Buffer.from(p.audio_base_64, 'base64'));
    console.log(`${file}  (${p.duration_secs?.toFixed?.(1) ?? '?'} dtk)`);
  }
}
