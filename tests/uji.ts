import assert from 'node:assert/strict';
import { clearGame, loadGame, OLD_SAVE_KEY, SAVE_KEY, saveGame } from '../src/save';
import { addDeposit, BOSS_HP, CALM, chapterTitle, heldPollution, PAY } from '../src/story/state';
import type { PlayerProgress, UpgradeId } from '../src/types';
import { computeStats, createInitialProgress, getUpgradeCost, isForSale, levelCap, UPGRADE_DEFS } from '../src/upgrades';
import { PIER_END } from '../src/world';
import { MemoryStore, seedRandom, Session, type Style } from './bot';

const DT = 1 / 30;
const SEEDS = [1, 2, 3];
const STYLES: Style[] = ['biasa', 'tanpa', 'sejuta'];
const checkpoints = new Map<number, string>();
let passed = 0;
let failed = 0;

function test(name: string, run: () => void): void {
  try {
    run();
    passed += 1;
    console.log(`LULUS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`GAGAL ${name}\n`, error);
  }
}

function time(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function reach(s: Session, seconds: number, ready: () => boolean, label: string): void {
  if (!ready()) s.runFor(seconds, ready, DT);
  assert.ok(ready(), `${label} pada ${time(s.clock)} (${s.sim.story.objective().title})`);
}

function invariant(s: Session): void {
  assert.deepEqual(s.violations, []);
  assert.equal(s.progress.story.pollution, heldPollution(s.progress));
  assert.ok(s.bestMinute() <= 492, `${s.bestMinute()} koin baru dalam 60 dtk`);
  for (const start of s.starts) assert.ok(start.calm >= CALM, `${start.id}: jeda ${start.calm} dtk`);
  const entries = s.jobs();
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
}

function snapshot(s: Session): string {
  s.save();
  const raw = s.store.getItem(SAVE_KEY);
  assert.ok(raw, 'Simpanan v3 tersedia');
  return raw;
}

function resume(raw: string, style: Style = 'diam'): Session {
  const store = new MemoryStore();
  store.setItem(SAVE_KEY, raw);
  assert.ok(loadGame(store).hasSave);
  return new Session(store, style);
}

function at(chapter: number, style: Style = 'diam'): Session {
  const raw = checkpoints.get(chapter);
  assert.ok(raw, `Simpanan awal bab ${chapter} tersedia`);
  seedRandom(14 + chapter);
  return resume(raw, style);
}

function reload(s: Session, style?: Style): Session {
  const data = snapshot(s);
  const before = s.progress.story;
  const objective = s.sim.story.objective();
  const restored = resume(data, style);
  const after = restored.progress.story;
  assert.equal(restored.progress.coins, s.progress.coins, 'Saldo');
  assert.equal(restored.progress.totalCoinsEarned, s.progress.totalCoinsEarned, 'Pendapatan tercatat');
  assert.deepEqual(restored.progress.upgrades, s.progress.upgrades, 'Pembelian');
  assert.deepEqual(after.flags, before.flags, 'Bukti cerita');
  for (const field of ['chapter', 'step', 'clock', 'pollution', 'calmUntil', 'turn', 'threat', 'jobSeq', 'supplyTimer', 'box', 'openingLeft', 'baskets', 'bossHp'] as const) {
    assert.equal(after[field], before[field], field);
  }
  assert.deepEqual(after.arrivals, before.arrivals, 'Jatah pasang');
  assert.deepEqual(after.trash, before.trash, 'Benda di laguna');
  assert.deepEqual(after.sources, before.sources, 'Sumber pencemaran');
  assert.deepEqual(after.log, before.log, 'Buku pembayaran');
  assert.equal(after.job?.id, before.job?.id, 'ID kejadian');
  assert.equal(restored.sim.story.objective().key, objective.key, 'Tujuan aktif');
  return restored;
}

for (const style of STYLES) {
  for (const seed of SEEDS) {
    test(`cerita ${style}, seed ${seed}`, () => {
      seedRandom(seed);
      const start = style === 'sejuta' ? 1_000_000 : 0;
      const s = new Session(new MemoryStore(), style, start);
      assert.equal(s.progress.coins, start);
      assert.equal(s.progress.story.pollution, 36);
      assert.equal(s.progress.story.openingLeft, 6);
      assert.equal(s.progress.story.arrivals.length, 6);
      assert.equal(s.progress.shopUnlocked, false);
      reach(s, 20 * 60, () => s.progress.story.flags.ending, 'Tamat');
      invariant(s);
      assert.deepEqual(s.chapters.map((chapter) => chapter.n), [2, 3, 4, 5, 6, 7, 8, 9]);
      assert.equal(s.progress.story.pollution <= 30, true);
      assert.ok(s.firstBlueprint >= 0 && s.workshop >= 0);
      assert.equal(s.jobs().filter((job) => job.id.startsWith('ending-')).length, 1);
      assert.equal(s.income.reduce((sum, payment) => sum + payment.amount, 0), s.progress.totalCoinsEarned);
      if (style === 'tanpa') assert.deepEqual(s.bought, []);
      if (style === 'sejuta') assert.ok(s.bought.some(({ id, level }) => id === 'wave_power' && level === 3));
      assert.ok(s.progress.story.recoveries.length > 0, 'P pernah pulih ke 30 atau kurang');
      console.log(JSON.stringify({
        gaya: style, seed, bab: ['0:00', ...s.chapters.map(({ at }) => time(at))],
        bengkel: time(s.workshop), cetakBiru: time(s.firstBlueprint),
        pemasukanPerMenit: s.perMinute(), maksimum60Detik: s.bestMinute(), totalBaru: s.progress.totalCoinsEarned,
        terburukP: s.worstP, pulihDetik: s.progress.story.recoveries, akhirP: s.progress.story.pollution,
        jedaTersingkat: Math.min(...s.starts.map((j) => j.calm)).toFixed(1),
      }));
    });
  }
}

test('simpanan awal tiap bab dapat dicapai dari awal', () => {
  seedRandom(4);
  const s = new Session(new MemoryStore(), 'biasa');
  checkpoints.set(1, snapshot(s));
  for (let chapter = 2; chapter <= 9; chapter++) {
    reach(s, 240, () => s.progress.story.chapter === chapter, `Bab ${chapter}`);
    checkpoints.set(chapter, snapshot(s));
  }
  invariant(s);
});

for (let chapter = 1; chapter <= 8; chapter++) {
  test(`diam 240 dtk di bab ${chapter} · ${chapterTitle(chapter)}`, () => {
    const s = at(chapter);
    const before = s.jobs().length;
    s.runFor(240);
    assert.equal(s.progress.story.chapter, chapter);
    assert.ok(s.jobs().slice(before).every((job) => job.pay === 0), 'Kejadian yang diabaikan tidak membayar');
    assert.equal(s.progress.story.flags.ending, false);
    invariant(s);
  });
}

test('penjarahan gagal, jaring terbuka dan keranjang baru datang setelah jeda', () => {
  const s = at(4);
  reach(s, 120, () => s.sim.netClosed, 'Jaring ditutup penjarah');
  const id = s.progress.story.job?.id;
  reach(s, 50, () => s.jobs().some((j) => j.id === id && j.result === 'failed' && j.pay === 0), 'Dua keranjang hilang');
  assert.equal(s.progress.story.baskets, 0);
  assert.equal(s.sim.netClosed, false);
  assert.equal(s.progress.story.chapter, 4);
  assert.ok(s.radio.some((line) => line.includes('Dua-duanya dibawa lari')));
  reach(s, 65, () => s.starts.some((j) => j.id !== id), 'Penjarahan berikutnya');
  assert.equal(s.progress.story.baskets, 2);
  invariant(s);
  const retry = reload(s, 'tanpa');
  reach(retry, 120, () => retry.progress.story.chapter === 5, 'Selamatkan keranjang percobaan berikutnya');
  invariant(retry);
});

test('gelombang penjarah harus dihalau sebelum pukat cerita datang', () => {
  const s = at(5);
  assert.equal(s.progress.story.rounds, 2);
  s.runFor(150);
  assert.ok(s.starts.length > 0 && s.starts.every((j) => j.id.startsWith('raid-')), 'Hanya penjarah yang datang');
  assert.equal(s.progress.story.rounds, 2, 'Penjarahan gagal tidak dihitung');
  assert.equal(s.progress.story.chapter, 5);
  const bot = reload(s, 'tanpa');
  reach(bot, 200, () => bot.progress.story.rounds === 0, 'Dua gelombang dihalau');
  reach(bot, 120, () => bot.progress.story.job?.kind === 'trawl', 'Pukat cerita datang');
  invariant(bot);
});

test('pukat yang diabaikan meninggalkan jaring hantu dan dapat digagalkan lagi', () => {
  const s = at(5);
  s.progress.story.rounds = 0;
  reach(s, 130, () => s.jobs().some((j) => j.kind === 'trawl' && j.result === 'failed'), 'Pukat lolos');
  assert.equal(s.jobs().at(-1)?.pay, 0);
  // the ghost net holds 6; pieces that strand meanwhile add their own 2 each
  assert.ok((s.jobs().at(-1)?.dP ?? 0) >= 6);
  assert.ok(s.progress.story.sources.some((q) => q.kind === 'ghost_net' && q.amount === 6));
  assert.ok(s.sim.entities.some((entity) => entity.kind === 'ghost_net'));
  assert.ok(s.sim.story.view.school.gone > 0);
  const retry = reload(s, 'tanpa');
  reach(retry, 150, () => retry.progress.story.chapter === 6, 'Pukat berikutnya gagal menangkap ikan');
  invariant(s);
  invariant(retry);
});

test('drum bocor, bantalan menyerap tumpahan dan upah turun menjadi 12', () => {
  const s = at(6);
  s.progress.story.rounds = 0;
  const oldSpills = s.progress.story.sources.filter((q) => q.kind === 'spill').length;
  reach(s, 130, () => s.progress.story.job?.phase === 'clean', 'Drum bocor');
  assert.equal(s.progress.story.job?.leaked, true);
  assert.equal(s.progress.story.sources.filter((q) => q.kind === 'spill').length, oldSpills + 1);
  const retry = reload(s, 'tanpa');
  reach(retry, 150, () => retry.progress.story.chapter === 7, 'Tumpahan terserap');
  assert.equal(retry.jobs().at(-1)?.pay, 12);
  assert.equal(retry.progress.story.sources.filter((q) => q.kind === 'spill').length, 0);
  invariant(s);
  invariant(retry);
});

test('simpan sebelum film selesai, sebelum peti tiba dan saat peti sudah lepas', () => {
  const store = new MemoryStore();
  assert.ok(saveGame(store, createInitialProgress()));
  const opening = new Session(store, 'diam');
  assert.equal(opening.sim.entities.filter((e) => e.opening).length, 6);
  assert.equal(opening.progress.story.pollution, 36);
  const s = at(1, 'tanpa');
  reach(s, 80, () => s.progress.story.box === 'snagged', 'Enam sampah awal terangkat');
  assert.equal(s.progress.coins, 28);
  assert.equal(s.progress.shopUnlocked, false);
  assert.equal(s.progress.story.openingLeft, 0);
  const before = reload(s);
  const box = before.sim.entities.find((e) => e.kind === 'toolbox');
  assert.ok(box?.snagged);
  const { from, to } = before.carry(box, PIER_END);
  assert.ok(before.swipe(from, to));
  reach(before, 2, () => before.progress.story.box === 'loose', 'Peti lepas');
  const loose = reload(before, 'tanpa');
  assert.deepEqual(loose.progress.story.boxAt, before.progress.story.boxAt);
  assert.equal(loose.sim.entities.find((e) => e.kind === 'toolbox')?.snagged, false);
  reach(loose, 60, () => loose.progress.shopUnlocked, 'Peti di tangan Bu Sari');
  assert.equal(loose.progress.coins, 28);
  invariant(loose);
});

test('ikuti panah dari sampah sampai perahu, dengan kunjungan bengkel tanpa pembelian', () => {
  seedRandom(19);
  let s = new Session(new MemoryStore(), 'diam');
  const follow = (until: () => boolean) => {
    for (let frame = 0; frame < 120 / DT && !until(); frame++) {
      const { swipe } = s.sim.story.objective();
      if (swipe && frame % 36 === 0 && s.sim.energy >= 18) s.swipe(swipe.from, swipe.to);
      s.step(DT);
    }
    assert.ok(until(), s.sim.story.objective().title);
  };
  follow(() => s.progress.shopUnlocked);
  s = reload(s);
  s.runFor(45);
  const visit = s.sim.story.objective();
  assert.equal(visit.key, 'workshop');
  assert.equal(visit.at, undefined);
  assert.equal(visit.swipe, undefined);
  assert.equal(s.progress.story.job, null);
  assert.equal(s.progress.coins >= getUpgradeCost('wave_width', 0), true);
  assert.ok(s.sim.story.leaveWorkshop());
  assert.equal(s.sim.story.leaveWorkshop(), false);
  assert.equal(s.sim.story.objective().key, 'rope');
  assert.equal(s.sim.story.objective().at, undefined);
  s = reload(s);
  const legacy = JSON.parse(snapshot(s)) as PlayerProgress;
  delete legacy.story.marks.workshopVisit;
  const oldVisit = resume(JSON.stringify(legacy));
  assert.equal(oldVisit.sim.story.objective().key, 'workshop');
  assert.ok(oldVisit.sim.story.leaveWorkshop());
  follow(() => s.progress.story.job?.kind === 'dolphin' && s.progress.story.job.hp === 2);
  s = reload(s);
  assert.equal(s.sim.story.objective().progress, '1/3');
  const midRescue = JSON.parse(snapshot(s)) as PlayerProgress;
  delete midRescue.story.marks.workshopVisit;
  assert.equal(resume(JSON.stringify(midRescue)).sim.story.objective().progress, '1/3');
  follow(() => s.progress.story.flags.dolphin);
  assert.equal(s.sim.story.objective().at, undefined);
  follow(() => s.progress.story.flags.damar);
  assert.equal(s.sim.story.objective().at, undefined);
  assert.equal(s.progress.upgrades.wave_width, 0);
});

test('transaksi Tenaga Pasang disimpan langsung tanpa biaya kedua', () => {
  const s = at(4, 'biasa');
  s.progress.coins = Math.max(s.progress.coins, getUpgradeCost('wave_power', 0));
  const prior = s.progress.coins;
  assert.equal(s.progress.upgrades.wave_power, 0);
  s.shop();
  assert.equal(s.progress.upgrades.wave_power, 1);
  assert.equal(s.progress.coins, prior - getUpgradeCost('wave_power', 0));
  const saved = s.store.getItem(SAVE_KEY);
  assert.ok(saved, 'Pembelian tersimpan tanpa menunggu autosave');
  assert.equal(resume(saved).progress.upgrades.wave_power, 1);
  const restored = reload(s);
  assert.equal(restored.progress.coins, prior - getUpgradeCost('wave_power', 0));
});

test('muat saat satu keranjang dirampas, selamatkan sisanya dan bayar 12 sekali', () => {
  const s = at(4);
  reach(s, 140, () => s.progress.story.job?.baskets === 1, 'Satu keranjang dirampas');
  const restored = reload(s, 'tanpa');
  assert.equal(restored.progress.story.job?.baskets, 1);
  assert.equal(restored.sim.netClosed, true);
  const id = restored.progress.story.job?.id;
  reach(restored, 90, () => restored.jobs().some((j) => j.id === id), 'Satu keranjang dipertahankan');
  assert.equal(restored.jobs().at(-1)?.pay, 12);
  const paid = reload(restored);
  paid.runFor(10);
  assert.equal(paid.jobs().filter((j) => j.id === id).length, 1);
  assert.equal(paid.progress.coins - restored.progress.coins, paid.income.reduce((total, payment) => total + payment.amount, 0));
  assert.deepEqual(paid.jobs(), restored.jobs());
  invariant(restored);
});

test('kapal induk dilanjutkan pada kesempatan hantam yang sama dan bayaran akhir hanya sekali', () => {
  const s = at(8, 'tanpa');
  reach(s, 200, () => s.progress.story.job?.phase === 'window' && s.progress.story.bossHp < BOSS_HP, 'Lambung sudah terkena');
  const restored = reload(s, 'tanpa');
  assert.equal(restored.progress.story.job?.hp, s.progress.story.job?.hp);
  assert.equal(restored.progress.story.job?.phase, 'window');
  assert.equal(restored.progress.story.job?.windowDamage, s.progress.story.job?.windowDamage);
  reach(restored, 16, () => restored.progress.story.job?.phase === 'rest', 'Kapal menarik alat berikutnya');
  assert.ok(restored.progress.story.bossHp >= BOSS_HP - 30, 'Muat ulang tetap membatasi 30 damage per giliran');
  reach(restored, 240, () => restored.progress.story.flags.ending, 'Kapal induk pergi dan fajar');
  const paid = reload(restored);
  const atEnd = paid.progress.coins;
  const ending = paid.jobs().filter((j) => j.id.startsWith('ending-'));
  assert.equal(ending.length, 1);
  assert.equal(ending[0].pay, 60);
  paid.runFor(20);
  // the tide may still carry a piece into the net; the dawn's 60 does not come again
  assert.ok(paid.progress.coins - atEnd < PAY.ending, 'Bayaran fajar tidak terulang');
  assert.deepEqual(paid.jobs().filter((j) => j.id.startsWith('ending-')), ending);
  invariant(restored);
  invariant(paid);
});

test('simpanan terpotong dan penyimpanan penuh ditangani', () => {
  const store = new MemoryStore();
  store.setItem(SAVE_KEY, '{"story":');
  assert.equal(loadGame(store).hasSave, false);
  assert.equal(new Session(store, 'diam').progress.coins, 0);
  const progress = createInitialProgress();
  assert.ok(saveGame(store, progress));
  const previous = store.getItem(SAVE_KEY);
  store.broken = true;
  progress.coins = 20;
  assert.equal(saveGame(store, progress), false);
  assert.equal(store.getItem(SAVE_KEY), previous);
  assert.equal(saveGame(null, progress), false);
  clearGame(store);
  assert.equal(loadGame(store).hasSave, false);
});

test('migrasi v2 menjaga saldo, alat, bengkel, penyelamatan dan akses yang sudah diperoleh', () => {
  const store = new MemoryStore();
  const v2 = { ...createInitialProgress(), story: undefined, coins: 1_000_000, totalCoinsEarned: 42, totalWaves: 5 };
  store.setItem(OLD_SAVE_KEY, JSON.stringify(v2));
  let s = new Session(store, 'diam');
  assert.equal(s.progress.coins, v2.coins);
  assert.equal(s.progress.story.chapter, 1);
  assert.equal(s.progress.shopUnlocked, false);
  assert.equal(s.progress.story.flags.dolphin, false);
  const legacy = { ...v2, shopUnlocked: true, dolphinRescued: true, upgrades: { ...v2.upgrades, wave_power: 3 } };
  store.setItem(OLD_SAVE_KEY, JSON.stringify(legacy));
  assert.equal(loadGame(store).migrated, true);
  s = new Session(store, 'diam');
  assert.equal(s.progress.upgrades.wave_power, 3);
  assert.equal(s.progress.story.flags.dolphin, true);
  assert.equal(s.progress.story.chapter, 3);
  assert.equal(s.progress.shopUnlocked, true);
  const withCall = { ...legacy, upgrades: { ...legacy.upgrades, unlock_boss: 1 } };
  store.setItem(OLD_SAVE_KEY, JSON.stringify(withCall));
  s = new Session(store, 'diam');
  assert.equal(s.progress.story.flags.ops, true);
  assert.equal(s.progress.story.chapter, 3, 'Tujuan pertama yang belum terbukti tetap muncul');
  assert.ok(s.sim.story.answerCall());
  reach(s, 50, () => s.progress.story.job?.kind === 'boss', 'Akses lama ke kapal induk');
  clearGame(store);
  store.setItem(OLD_SAVE_KEY, JSON.stringify({ ...withCall, victoryAchieved: true, endlessMode: true }));
  s = new Session(store, 'diam');
  assert.equal(s.progress.story.chapter, 9);
  assert.equal(s.progress.endlessMode, true);
  assert.equal(s.progress.coins, v2.coins);
  assert.equal(s.progress.story.flags.ending, true);
  s.runFor(5);
  assert.equal(s.progress.coins, v2.coins);
  invariant(s);
});

test('cetak biru dan level membatasi saldo sejuta di setiap bab', () => {
  const expected: UpgradeId[][] = [
    [], ['wave_width', 'tidal_energy'], ['net_expand', 'ai_guide', 'energy_regen'],
    ['wave_power', 'tidal_charge', 'unlock_boats'], ['ai_sonar', 'echo_wave'], [],
    ['combo_flow', 'ai_buoy', 'resonance_burst'], [], ['trash_density', 'trash_rarity', 'unlock_forest'],
  ];
  const opened = new Set<UpgradeId>();
  for (let chapter = 1; chapter <= 9; chapter++) {
    const raw = checkpoints.get(chapter);
    assert.ok(raw);
    const saved: PlayerProgress = JSON.parse(raw);
    saved.coins = 1_000_000;
    saved.upgrades = createInitialProgress().upgrades;
    const s = resume(JSON.stringify(saved), 'sejuta');
    expected[chapter - 1].forEach((id) => opened.add(id));
    if (s.progress.story.flags.planted) opened.add('unlock_mangrove');
    s.shop();
    for (const { id, maxLevel } of UPGRADE_DEFS) {
      if (id === 'core') continue;
      const cap = [0, 1, 1, 2, 2, 2, 3, 3, maxLevel][chapter - 1];
      const canBuy = opened.has(id) && (id !== 'unlock_forest' || opened.has('unlock_mangrove'));
      assert.equal(s.progress.upgrades[id], canBuy ? Math.min(cap, maxLevel) : 0, `Bab ${chapter} · ${id}`);
      assert.equal(isForSale(id, s.progress), false, `Pembelian sudah mentok: ${id}`);
      assert.equal(levelCap(id, s.progress), Math.min(cap, maxLevel));
    }
    assert.equal(s.progress.totalCoinsEarned, saved.totalCoinsEarned);
  }
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => getUpgradeCost('wave_power', i)), [78, 144, 267, 494, 914]);
});

test('ombak tanpa charge mengubah 10 menjadi 14 damage, dari 3 hantaman menjadi 2', () => {
  for (const level of [0, 1]) {
    const s = at(4);
    s.progress.upgrades.wave_power = level;
    reach(s, 55, () => s.sim.entities.some((e) => e.kind === 'raider' && e.x < 1180), 'Kapal masuk jangkauan');
    const raid = s.progress.story.job;
    assert.equal(raid?.hp, 24);
    const damage = level ? 14 : 10;
    for (let hit = 1; hit <= (level ? 2 : 3); hit++) {
      const ship = s.sim.entities.find((e) => e.kind === 'raider');
      assert.ok(ship);
      const { from, to } = s.carry(ship, { x: ship.x + 80, y: ship.y }, 80);
      const before = raid?.hp;
      assert.ok(s.swipe(from, to, 0));
      reach(s, 2, () => raid?.hp !== before, 'Ombak menghantam lambung');
      assert.equal(raid?.hp, 24 - hit * damage);
    }
    assert.equal(s.jobs().at(-1)?.pay, 24);
    invariant(s);
  }
});

function withDeposits(p: number, style: Style): Session {
  const raw = checkpoints.get(3);
  assert.ok(raw);
  const saved: PlayerProgress = JSON.parse(raw);
  saved.story.sources = [];
  saved.story.trash = [];
  saved.story.pollution = p;
  // Keep the first deposit a full four points even when P is odd.
  for (let left = p; left > 0; left -= 4) addDeposit(saved.story, Math.min(4, left));
  return resume(JSON.stringify(saved), style);
}

test('P 59 dan 60 menentukan upah perahu 20 dan 16 sebelum berangkat', () => {
  for (const [p, pay] of [[59, 20], [60, 16]]) {
    const s = withDeposits(p, 'diam');
    assert.equal(computeStats(s.progress).ecoPercent, 100 - p);
    reach(s, 70, () => s.progress.story.job?.kind === 'boat', 'Perahu berangkat');
    assert.equal(s.progress.story.job?.p0, p);
    assert.equal(s.progress.story.job?.pay, pay);
    const help = reload(s, 'tanpa');
    reach(help, 110, () => help.jobs().some((j) => j.kind === 'boat'), 'Perahu merapat');
    assert.equal(help.jobs().at(-1)?.pay, pay);
    invariant(help);
  }
});

test('endapan ditunjukkan pada P 31, disapu dengan ombak dasar, dan tetap tersembunyi pada P 30', () => {
  const healthy = withDeposits(30, 'diam');
  healthy.step();
  assert.equal(healthy.sim.entities.some((e) => e.kind === 'deposit'), false);
  const s = withDeposits(31, 'tanpa');
  s.step();
  assert.ok(s.sim.entities.some((e) => e.kind === 'deposit'));
  reach(s, 27, () => s.progress.story.pollution === 27, 'Empat poin endapan terangkat');
  invariant(s);
});

test('patroli bergiliran dan jatah rongsok tetap berlaku setelah muat', () => {
  const s = at(9, 'diam');
  reach(s, 1500, () => s.starts.length === 9, 'Sembilan giliran patroli');
  assert.deepEqual(s.starts.map(({ id }) => id.replace(/-\d+$/, '')), ['calf', 'raid', 'boat', 'trawl', 'calf', 'raid', 'boat', 'waste', 'calf']);
  assert.ok(s.jobs().slice(at(9).jobs().length).every((job) => job.pay === 0));
  invariant(s);
  const rich = resume(snapshot(at(9)), 'sejuta');
  rich.progress.coins = 1_000_000;
  rich.shop();
  assert.ok(rich.progress.upgrades.trash_rarity > 0);
  rich.runFor(180);
  reach(rich, 200, () => !rich.progress.story.job, 'Simpanan saat jeda patroli');
  invariant(rich);
  const continued = reload(rich, 'sejuta');
  continued.runFor(540);
  invariant(continued);
  const income = [...rich.income, ...continued.income];
  const peak = Math.max(...income.map(({ at }) => income.reduce((total, payment) =>
    payment.at > at - 60 && payment.at <= at ? total + payment.amount : total, 0)));
  assert.ok(peak > 0 && peak <= 492, `Puncak pemasukan patroli ${peak}`);
  console.log(`Patroli: puncak ${peak} koin baru/60 dtk, P terburuk ${Math.max(rich.worstP, continued.worstP)}`);
});

console.log(`\n${passed} lulus, ${failed} gagal.`);
if (failed) process.exitCode = 1;
