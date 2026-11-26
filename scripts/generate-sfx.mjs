import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'audio');

const MODEL_ID = 'eleven_text_to_sound_v3';
const OUTPUT_FORMAT = 'mp3_44100_96';

/**
 * Sound manifest for ALUN: Gema Pesisir Tropis.
 * Covers Issue #9: waves, trash-into-net, combo, weather, and UI,
 * plus coastal ambience & key lagoon interactions.
 */
export const SFX_MANIFEST = [
  // === 1. AMBIENCE & WEATHER (Cuaca) ===
  {
    id: 'ocean-ambience',
    text: 'Gentle tropical turquoise lagoon waves softly lapping and receding on a warm sandy Indonesian beach, peaceful coastal surf ambience, clean natural ocean water, no voices, no birds',
    durationSeconds: 10.0,
    promptInfluence: 0.55,
    loop: true,
  },
  {
    id: 'rain-monsoon',
    text: 'Steady tropical monsoon rain falling heavily onto ocean water and wide palm leaves, rich natural coastal rainfall texture, continuous steady downpour, no thunder, no voices',
    durationSeconds: 10.0,
    promptInfluence: 0.55,
    loop: true,
  },
  {
    id: 'storm-wind',
    text: 'Warm coastal tropical ocean breeze and monsoon wind rustling gently through palm fronds across open water, smooth airy atmospheric wind texture, no harsh whistling',
    durationSeconds: 8.0,
    promptInfluence: 0.5,
    loop: true,
  },
  {
    id: 'thunder-1',
    text: 'Deep atmospheric distant tropical monsoon thunder rolling softly across an open ocean horizon, warm cinematic low rumble fading gently, no sudden harsh crack',
    durationSeconds: 4.0,
    promptInfluence: 0.6,
    loop: false,
  },
  {
    id: 'thunder-2',
    text: 'Distant coastal thunderclap echoing smoothly over a rain-swept tropical sea, resonant deep low rolling storm rumble',
    durationSeconds: 3.6,
    promptInfluence: 0.6,
    loop: false,
  },
  {
    id: 'weather-shift',
    text: 'Soft warm tropical coastal breeze swell with delicate hollow bamboo wind chimes gently tinkling in the distance, serene atmospheric transition',
    durationSeconds: 2.2,
    promptInfluence: 0.6,
    loop: false,
  },

  // === 2. WAVES & WATER MOTION (Ombak) ===
  {
    id: 'wave-light',
    text: 'Crisp refreshing small ocean wave swipe pushing across turquoise water, smooth lively watery whoosh with light foamy spray, tactile game sound effect, clean tail',
    durationSeconds: 1.0,
    promptInfluence: 0.65,
    loop: false,
  },
  {
    id: 'wave-heavy',
    text: 'Powerful surging tropical tidal wave cresting and rushing forward, deep forceful ocean water whoosh with rich foaming splash and resonant watery sub-swell, exhilarating game SFX',
    durationSeconds: 1.6,
    promptInfluence: 0.65,
    loop: false,
  },
  {
    id: 'wave-echo',
    text: 'Soft shimmering secondary water ripple and delicate splashing wave wash trailing across calm tropical sea, airy crisp water echo',
    durationSeconds: 0.9,
    promptInfluence: 0.65,
    loop: false,
  },
  {
    id: 'wave-charge',
    text: 'Swirling underwater ocean tidal current building smooth rising energy hum, bubbling watery vortex charge loop, warm coastal magic tone',
    durationSeconds: 3.5,
    promptInfluence: 0.55,
    loop: true,
  },
  {
    id: 'shore-splash',
    text: 'Foamy ocean wave crest washing and fizzing softly onto wet sandy beach shoreline, crisp natural coastal surf splash',
    durationSeconds: 1.0,
    promptInfluence: 0.65,
    loop: false,
  },
  {
    id: 'resonance-burst',
    text: 'Magical tidal shockwave burst, deep ocean water boom layered with radiant crystalline chime and sparkling foamy spray, triumphant clean game power-up impact',
    durationSeconds: 1.7,
    promptInfluence: 0.65,
    loop: false,
  },

  // === 3. TRASH INTO COLLECTOR NET (Sampah Masuk Jaring) ===
  {
    id: 'net-catch-1',
    text: 'Satisfying crisp water plop into a woven rope fishing net with a warm hollow wooden marimba pop, cozy tactile tropical game collect sound effect, short and punchy',
    durationSeconds: 0.7,
    promptInfluence: 0.72,
    loop: false,
  },
  {
    id: 'net-catch-2',
    text: 'Bubbly water scoop splash into a wet coastal net paired with a bright playful bamboo percussive tap, crisp satisfying game pickup sound effect',
    durationSeconds: 0.7,
    promptInfluence: 0.72,
    loop: false,
  },
  {
    id: 'trash-rare',
    text: 'Crisp sparkling water scoop splash layered with a bright tropical wooden marimba and shimmering glass chime flourish, rewarding rare item pickup game SFX',
    durationSeconds: 1.1,
    promptInfluence: 0.7,
    loop: false,
  },
  {
    id: 'trash-epic',
    text: 'Lush triumphant tropical marimba chord and golden sparkling bell shimmer over a lively water splash into a net, rewarding epic treasure collect game SFX',
    durationSeconds: 1.4,
    promptInfluence: 0.7,
    loop: false,
  },
  {
    id: 'trash-legendary',
    text: 'Radiant magical tropical coastal fanfare with sparkling kalimba and harp arpeggio, warm golden shimmer and crisp water splash, unforgettable legendary discovery game SFX',
    durationSeconds: 1.8,
    promptInfluence: 0.68,
    loop: false,
  },

  // === 4. COMBO SYSTEM (Kombo) ===
  {
    id: 'combo-milestone',
    text: 'Uplifting bright ascending tropical wooden marimba and bamboo wind chime accent with a crisp sparkling water droplet flourish, exciting combo streak milestone game SFX',
    durationSeconds: 1.2,
    promptInfluence: 0.72,
    loop: false,
  },
  {
    id: 'combo-break',
    text: 'Gentle soft descending two-note hollow bamboo wood tap and quiet water drop, calm non-harsh combo fade game sound effect',
    durationSeconds: 0.7,
    promptInfluence: 0.72,
    loop: false,
  },

  // === 5. UI & PROGRESSION (UI) ===
  {
    id: 'ui-click',
    text: 'Crisp minimal hollow tropical bamboo wood click with a tiny soft water droplet pop, clean cozy game UI button tap, very short',
    durationSeconds: 0.5,
    promptInfluence: 0.8,
    loop: false,
  },
  {
    id: 'ui-tab',
    text: 'Light breezy two-tone wooden marimba slide click, delicate coastal tropical UI tab switch sound effect, short and airy',
    durationSeconds: 0.55,
    promptInfluence: 0.78,
    loop: false,
  },
  {
    id: 'ui-open',
    text: 'Soft airy tropical palm breeze whoosh with a warm ascending wooden bamboo chime, pleasant cozy game UI menu opening sound',
    durationSeconds: 0.75,
    promptInfluence: 0.75,
    loop: false,
  },
  {
    id: 'ui-close',
    text: 'Gentle settling hollow bamboo tap with a brief soft downward air puff, clean cozy game UI menu closing sound',
    durationSeconds: 0.65,
    promptInfluence: 0.75,
    loop: false,
  },
  {
    id: 'ui-error',
    text: 'Soft muted low hollow wooden knock double thud, gentle non-jarring game UI denied or insufficient coins feedback sound',
    durationSeconds: 0.55,
    promptInfluence: 0.78,
    loop: false,
  },
  {
    id: 'upgrade-buy',
    text: 'Satisfying bright tropical coin clink followed by a warm ascending wooden marimba two-note chime with gentle sparkle, rewarding upgrade purchase game SFX',
    durationSeconds: 1.1,
    promptInfluence: 0.72,
    loop: false,
  },
  {
    id: 'shop-unlock',
    text: 'Bright welcoming tropical bamboo chime melody with gentle sparkling ocean bell shimmer, cheerful menu feature unlocked game jingle',
    durationSeconds: 1.5,
    promptInfluence: 0.7,
    loop: false,
  },
  {
    id: 'achievement-claim',
    text: 'Joyful sparkling tropical coastal badge fanfare, bright ascending wooden marimba arpeggio with warm golden chime sparkle, celebratory achievement claim SFX',
    durationSeconds: 1.6,
    promptInfluence: 0.7,
    loop: false,
  },

  // === 6. LAGOON WORLD & WILDLIFE POLISH ===
  {
    id: 'mangrove-plant',
    text: 'Organic lush green palm leaf rustle, soft sandy earth thump, and warm blooming wooden marimba chord, magical nature restoration game SFX',
    durationSeconds: 1.3,
    promptInfluence: 0.68,
    loop: false,
  },
  {
    id: 'boat-saved',
    text: 'Warm wooden fishing boat gently bumping a timber pier followed by a cheerful maritime brass bell and bright tropical wooden chime, boat rescued game SFX',
    durationSeconds: 1.5,
    promptInfluence: 0.68,
    loop: false,
  },
  {
    id: 'fire-douse',
    text: 'Crisp ocean water splash dousing flames with realistic sizzling steam hiss resolving into a clean bright relief chime',
    durationSeconds: 1.3,
    promptInfluence: 0.7,
    loop: false,
  },
  {
    id: 'trawler-hit',
    text: 'Heavy ocean wave slamming forcefully against a rusty steel ship hull, deep resonant metallic thud with splashing sea spray, impact game SFX',
    durationSeconds: 1.0,
    promptInfluence: 0.7,
    loop: false,
  },
  {
    id: 'splash',
    text: 'Natural crisp object splashing into clear tropical seawater with a lively bubbly plop and spray',
    durationSeconds: 0.8,
    promptInfluence: 0.7,
    loop: false,
  },
  {
    id: 'net-snap',
    text: 'Taut wet fishing rope net snapping and tearing free followed by a brisk ocean water splash',
    durationSeconds: 0.9,
    promptInfluence: 0.7,
    loop: false,
  },
  {
    id: 'bird-tropical-1',
    text: 'Single brief cheerful Indonesian tropical coastal songbird melodic chirp in warm morning forest air, clean natural bird call, no background noise',
    durationSeconds: 1.4,
    promptInfluence: 0.7,
    loop: false,
  },
  {
    id: 'bird-tropical-2',
    text: 'Gentle tropical island bird two-note flute-like whistle echoing softly from coastal palm trees, clean natural call, quiet background',
    durationSeconds: 1.5,
    promptInfluence: 0.7,
    loop: false,
  },
  {
    id: 'seagull',
    text: 'Distant coastal seagull calling twice softly over a calm tropical ocean lagoon, natural seabird cry, clean recording',
    durationSeconds: 1.5,
    promptInfluence: 0.7,
    loop: false,
  },
  {
    id: 'victory',
    text: 'Uplifting warm tropical sunrise victory fanfare with wooden marimba, bright kalimba arpeggio, and sparkling ocean chimes, joyful peaceful coastal triumph',
    durationSeconds: 3.0,
    promptInfluence: 0.65,
    loop: false,
  },
];

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function fileExistsNonEmpty(filePath) {
  try {
    const info = await stat(filePath);
    return info.size > 0;
  } catch {
    return false;
  }
}

async function generateOne(client, item, force) {
  const outPath = path.join(OUT_DIR, `${item.id}.mp3`);
  if (!force && (await fileExistsNonEmpty(outPath))) {
    console.log(`[skip] ${item.id}.mp3 (already exists)`);
    return { id: item.id, status: 'skipped' };
  }

  const audioStream = await client.textToSoundEffects.convert({
    text: item.text,
    modelId: MODEL_ID,
    durationSeconds: item.durationSeconds,
    promptInfluence: item.promptInfluence,
    loop: item.loop,
    outputFormat: OUTPUT_FORMAT,
  });

  const buffer = await streamToBuffer(audioStream);
  await writeFile(outPath, buffer);
  const kb = (buffer.length / 1024).toFixed(1);
  console.log(`[ok]   ${item.id}.mp3 (${kb} KB)`);
  return { id: item.id, status: 'generated', bytes: buffer.length };
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const filterIds = args.filter((a) => !a.startsWith('--'));

  const targets =
    filterIds.length > 0
      ? SFX_MANIFEST.filter((item) => filterIds.includes(item.id))
      : SFX_MANIFEST;

  if (targets.length === 0) {
    console.error('No matching SFX IDs found.');
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const client = new ElevenLabsClient();

  try {
    const sub = await client.user.subscription.get();
    const used = sub.characterCount ?? 0;
    const limit = sub.characterLimit ?? 0;
    console.log(`ElevenLabs quota: ${used.toLocaleString()} / ${limit.toLocaleString()} credits used (${(limit - used).toLocaleString()} remaining)`);
  } catch {
    // Non-fatal if subscription endpoint is restricted for this key
  }

  console.log(`Generating ${targets.length} sound(s) -> ${OUT_DIR} using ${MODEL_ID} (${OUTPUT_FORMAT})...`);

  const concurrency = 2;
  let index = 0;
  let failed = 0;

  async function worker() {
    while (index < targets.length) {
      const item = targets[index++];
      try {
        await generateOne(client, item, force);
      } catch (err) {
        failed++;
        console.error(`[err]  ${item.id}:`, err?.message ?? err);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (failed > 0) {
    console.error(`Finished with ${failed} failure(s). Re-run to retry failed items.`);
    process.exit(1);
  }
  console.log('All requested SFX generated successfully!');
}

main();
