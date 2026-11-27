import assert from 'node:assert/strict';
import { clearGame, loadBest, loadGame, OLD_SAVE_KEY, SAVE_KEY, saveGame, updateBest } from '../src/save';
import { platesFor } from '../src/scene/plates';
import { BASE_PIER_HP, buildNightWave, DAY_DURATION, heldPollution, NIGHT_DURATION, P_TRASH, pierRepairCost, PIRATE_SPECS, pirateScale, pirateSpec, REPAIR_HEAL } from '../src/story/state';
import { PIRATE_KIND } from '../src/types';
import { createInitialProgress, getUpgradeCost, isForSale, levelCap, UPGRADE_DEFS, UPGRADE_MAP } from '../src/upgrades';
import { COLLECTOR_NET } from '../src/world';
import { MemoryStore, seedRandom, Session, type Style } from './bot';

const DT = 1 / 30;
const SPECIAL_PIRATES = [PIRATE_KIND.shield, PIRATE_KIND.dumper, PIRATE_KIND.signal] as const;
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

function mm(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function reach(s: Session, seconds: number, ready: () => boolean, label: string): void {
  if (!ready()) s.runFor(seconds, ready, DT);
  assert.ok(ready(), `${label} pada ${mm(s.clock)} (Hari ${s.progress.story.day}/${s.progress.story.cycle}, HP ${s.progress.story.pierHp}/${s.progress.story.maxPierHp})`);
}

function invariant(s: Session): void {
  assert.deepEqual(s.violations, []);
  assert.equal(s.progress.story.pollution, heldPollution(s.progress));
  assert.ok(s.progress.story.pierHp >= 0 && s.progress.story.pierHp <= s.progress.story.maxPierHp);
}

function reload(s: Session, style?: Style): Session {
  s.save();
  const raw = s.store.getItem(SAVE_KEY);
  assert.ok(raw, 'Simpanan v4 tersedia');
  const store = new MemoryStore();
  store.setItem(SAVE_KEY, raw);
  assert.ok(loadGame(store).hasSave);
  const restored = new Session(store, style ?? s.style);
  assert.equal(restored.progress.coins, s.progress.coins, 'Saldo');
  assert.equal(restored.progress.story.day, s.progress.story.day, 'Hari');
  assert.equal(restored.progress.story.cycle, s.progress.story.cycle, 'Siklus');
  assert.equal(restored.progress.story.pierHp, s.progress.story.pierHp, 'HP Dermaga');
  assert.equal(restored.progress.story.pirates.length, s.progress.story.pirates.length, 'Bajak laut aktif');
  assert.equal(restored.progress.story.wavePlan.length, s.progress.story.wavePlan.length, 'Jadwal wave');
  return restored;
}

test('alur penuh 5 hari (siang 90 dtk + malam 60 dtk) sampai kalahkan Kapal Induk Badai Muson', () => {
  for (const seed of [1, 2]) {
    seedRandom(seed);
    const s = new Session(new MemoryStore(), 'biasa');
    assert.equal(s.progress.story.cycle, 'prep');
    assert.equal(s.progress.story.pierHp, BASE_PIER_HP);
    reach(s, 90, () => s.progress.story.cycle === 'day', 'Bengkel buka & Hari 1 mulai');
    assert.equal(s.progress.shopUnlocked, true);
    reach(s, 24 * 60, () => s.progress.story.flags.ending || s.progress.story.defeated, 'Tamat Malam 5');
    assert.equal(s.progress.story.defeated, false, 'Pemain aktif yang upgrade bertahan sampai Badai Muson');
    assert.equal(s.progress.story.flags.boss, true, 'Kapal Induk dikalahkan');
    assert.equal(s.progress.story.day, 6, 'Masuk Hari 6 Endless');
    assert.equal(s.progress.story.nightsSurvived, 5, 'Lima malam dilewati');
    assert.ok(s.bought.length >= 12, `Beli banyak upgrade incremental (${s.bought.length})`);
    assert.ok(s.progress.story.piratesSunk >= 45, `Banyak bajak laut dihalau (${s.progress.story.piratesSunk})`);
    for (const variant of SPECIAL_PIRATES) {
      const spec = PIRATE_SPECS[variant];
      assert.equal(s.radio.filter((line) => line === `BU SARI: ${spec.intro}`).length, 1, spec.name);
    }
    invariant(s);
    console.log(JSON.stringify({
      seed,
      tamat: mm(s.clock),
      koinTotal: s.progress.totalCoinsEarned,
      upgrade: s.bought.length,
      kapalDihalau: s.progress.story.piratesSunk,
      jalur: s.progress.totalCurrents,
      hpMin: s.minPierHp,
      hpAkhir: `${s.progress.story.pierHp}/${s.progress.story.maxPierHp}`,
    }));
  }
});

test('diam tidak bertahan: bajak laut menghancurkan dermaga -> kalah & tidak bisa dilanjutkan', () => {
  seedRandom(7);
  const store = new MemoryStore();
  saveGame(store, createInitialProgress(true));
  const s = new Session(store, 'diam');
  assert.equal(s.progress.story.cycle, 'day');
  // Natural day -> night progression (no early-night shortcut!)
  reach(s, DAY_DURATION + 200, () => s.progress.story.defeated, 'HP Dermaga mencapai 0');
  assert.equal(s.progress.story.pierHp, 0);
  assert.ok(s.defeatedAt > 0);
  s.save();
  assert.equal(loadGame(s.store).hasSave, false, 'Run yang kalah tidak bisa di-resume (wajib ulang dari Hari 1)');
  const best = updateBest(s.store, s.progress);
  assert.equal(best.bestDay, 1);
  assert.equal(loadBest(s.store).bestDay, 1);
  invariant(s);
});

test('tanpa upgrade sama sekali kewalahan di gelombang malam yang makin kuat', () => {
  seedRandom(11);
  const store = new MemoryStore();
  saveGame(store, createInitialProgress(true));
  const s = new Session(store, 'tanpa');
  reach(s, 18 * 60, () => s.progress.story.defeated || s.progress.story.flags.ending, 'Selesai atau kalah');
  assert.equal(s.bought.length, 0);
  assert.ok(s.progress.story.defeated || s.minPierHp < BASE_PIER_HP * 0.5, `Tanpa upgrade harus tertekan (defeated=${s.progress.story.defeated}, minPierHp=${s.minPierHp})`);
  invariant(s);
});

test('bengkel bertahap: Hari 1 hanya Tenaga & Muatan, cetak biru baru tiap fajar, batas level naik satu per hari', () => {
  seedRandom(3);
  const store = new MemoryStore();
  const init = createInitialProgress(true);
  init.coins = 1_000_000;
  saveGame(store, init);
  const s = new Session(store, 'sejuta');
  s.shop();
  const owned = UPGRADE_DEFS.filter((d) => d.id !== 'core' && s.progress.upgrades[d.id] > 0).map((d) => d.id).sort();
  assert.deepEqual(owned, ['trash_density', 'wave_power'], 'Hari 1 hanya Tenaga dan Muatan');
  assert.equal(s.progress.upgrades.wave_power, 2, 'Tenaga paling tinggi Lv 2 di Hari 1, berapa pun koinnya');
  // Tenaga Lv 4 waits for Day 3: no more Lv 4 on the second night
  for (const [day, cap] of [[2, 3], [3, 4], [4, 5], [5, 6]] as const) {
    s.progress.story.day = day;
    assert.equal(levelCap('wave_power', s.progress), cap, `Batas Tenaga Hari ${day}`);
  }
  s.progress.story.day = 2;
  assert.equal(isForSale('wave_width', s.progress), true, 'Bentang datang pada fajar Hari 2');
  assert.equal(isForSale('echo_wave', s.progress), false, 'Gema belum ada di Hari 2');
  // by Day 8 every blueprint has come and every tool can be maxed
  s.progress.story.day = 8;
  s.shop();
  for (const def of UPGRADE_DEFS) {
    if (def.id === 'core') continue;
    assert.equal(levelCap(def.id, s.progress), def.maxLevel, `Batas penuh di Hari 8: ${def.id}`);
    assert.equal(s.progress.upgrades[def.id], def.maxLevel, `Bisa maks: ${def.id}`);
    assert.equal(isForSale(def.id, s.progress), false);
  }
  assert.equal(s.progress.story.maxPierHp, BASE_PIER_HP + 5 * 35);
  assert.equal(s.progress.story.pierHp, s.progress.story.maxPierHp);
  assert.ok(getUpgradeCost('wave_power', 0) > 0);
  invariant(s);
});

test('urutan Muatan sebelum Jaring, HP kapal tumbuh lebih dari 2x per hari, kunci bengkel malam, tambal dermaga, dan pulih fajar', () => {
  assert.deepEqual(UPGRADE_MAP.trash_density.requires, ['core'], 'Muatan langsung dari Inti');
  assert.deepEqual(UPGRADE_MAP.net_expand.requires, ['trash_density'], 'Jaring setelah Muatan');
  assert.deepEqual(UPGRADE_MAP.trash_rarity.requires, ['net_expand'], 'Kelangkaan setelah Jaring');
  assert.equal(pirateScale(1), 1);
  const oldScale = [1, 2, 4, 8, 16];
  for (let d = 2; d <= 7; d++) {
    // the monsoon day leans on the mothership; every other day grows faster than the old doubling
    if (d !== 5) assert.ok(pirateScale(d) / pirateScale(d - 1) > 2, `HP kapal tumbuh lebih dari 2x pada Hari ${d}`);
    if (d <= 5) assert.ok(pirateScale(d) > oldScale[d - 1], `Lebih tangguh dari kurva lama pada Hari ${d}`);
  }

  seedRandom(5);
  const store = new MemoryStore();
  const init = createInitialProgress(true);
  init.coins = 500;
  saveGame(store, init);
  const s = new Session(store, 'biasa');
  assert.equal(DAY_DURATION, 90);
  assert.equal(NIGHT_DURATION, 60);

  // Damage pier and repair during Day
  s.sim.story.damagePier(40, 440, 468);
  assert.equal(s.progress.story.pierHp, 60);
  const cost = pierRepairCost(1);
  const beforeCoins = s.progress.coins;
  assert.equal(s.sim.story.repairPier(), true);
  assert.equal(s.progress.story.pierHp, 60 + REPAIR_HEAL);
  assert.equal(s.progress.coins, beforeCoins - cost);

  // Natural transition to Night 1 (no early-night trigger!)
  reach(s, DAY_DURATION + 4, () => s.progress.story.cycle === 'night', 'Malam 1 mulai alami');
  assert.equal(s.sim.story.waveHud().shopLocked, true, 'Bengkel terkunci saat malam');
  assert.equal(s.sim.story.repairPier(), false, 'Tidak bisa tambal dermaga saat malam');
  assert.ok(s.progress.story.hugeFlags.length >= 1, 'Ada penanda Gelombang Besar ala PvZ');

  // Reload mid-night preserves active wave & pirates cleanly
  s.runFor(6);
  const restored = reload(s, 'biasa');
  // Set clean beach & hurt pier slightly to verify free +25 dawn repair!
  restored.progress.story.sources = [];
  restored.progress.story.pollution = 0;
  restored.progress.story.pierHp = Math.min(restored.progress.story.pierHp, restored.progress.story.maxPierHp - 30);
  const hpBeforeDawn = restored.progress.story.pierHp;
  reach(restored, 120, () => restored.progress.story.day === 2 && restored.progress.story.cycle === 'day', 'Menang Malam 1');
  assert.ok(restored.progress.story.pierHp >= hpBeforeDawn + 20 || restored.progress.story.pierHp === restored.progress.story.maxPierHp, 'Pantai bersih menambal dermaga saat fajar');
  invariant(restored);
});

test('simpanan v4, migrasi v2, dan mode Endless Hari 6+ berjalan mulus', () => {
  const store = new MemoryStore();
  const v2 = { ...createInitialProgress(), story: undefined, coins: 800, totalCoinsEarned: 800, totalWaves: 10, shopUnlocked: true, dolphinRescued: true };
  store.setItem(OLD_SAVE_KEY, JSON.stringify(v2));
  const migrated = loadGame(store);
  assert.equal(migrated.hasSave, true);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.progress.story.version, 4);
  assert.equal(migrated.progress.story.cycle, 'day');

  // Test Endless Day 6 -> Night 6 survival with strong incremental upgrades
  seedRandom(9);
  clearGame(store);
  const end = createInitialProgress(true);
  end.coins = 50_000;
  end.story.day = 6;
  end.story.chapter = 6;
  end.story.dayTime = DAY_DURATION - 2;
  end.story.nightsSurvived = 5;
  end.story.flags.boss = true;
  end.story.flags.ending = true;
  end.victoryAchieved = true;
  end.endlessMode = true;
  saveGame(store, end);
  const s = new Session(store, 'sejuta');
  s.shop();
  reach(s, 8, () => s.progress.story.cycle === 'night', 'Malam 6 Endless mulai');
  assert.ok(s.progress.story.waveTotal >= 17, `Endless Hari 6 punya wave padat (${s.progress.story.waveTotal})`);
  reach(s, 140, () => s.progress.story.day === 7, 'Menang Endless Malam 6');
  assert.equal(s.progress.story.nightsSurvived, 6);
  invariant(s);
});

test('tiga kapal baru datang bertahap dengan jumlah kapal 1.5x dan pengali HP yang sama', () => {
  const sizes = [13, 20, 26, 32, 24, 38];
  for (const [index, size] of sizes.entries()) {
    const day = index + 1;
    const { plan, hugeFlags } = buildNightWave(day);
    assert.equal(plan.length, size, `Jumlah kapal Malam ${day}`);
    assert.deepEqual(plan.filter((p) => p.huge).map((p) => p.at / NIGHT_DURATION), hugeFlags);
    for (const [i, variant] of SPECIAL_PIRATES.entries()) {
      assert.equal(plan.some((p) => p.variant === variant), day >= i + 2, `${PIRATE_SPECS[variant].name} Malam ${day}`);
      assert.equal(pirateSpec(variant, day, true).hp, Math.round(PIRATE_SPECS[variant].hp * pirateScale(day)));
    }
  }
});

test('haluan Kapal Perisai meredam kerusakan dan dorongan, lambung dan buritannya terbuka', () => {
  seedRandom(12);
  const s = new Session(new MemoryStore(), 'diam');
  const story = s.sim.story;
  const ship = story.spawnPirate(PIRATE_KIND.shield, 0, true);
  Object.assign(ship, { x: 800, y: 400, rotation: Math.PI, hp: 100, maxHp: 100 });
  const hit = (dx: number, dy: number): { damage: number; shove: number } => {
    ship.hp = ship.maxHp;
    ship.vx = ship.vy = 0;
    s.sim.waves.length = 0;
    s.sim.energy = s.sim.stats.maxEnergy;
    assert.ok(s.swipe({ x: ship.x - dx * 88, y: ship.y - dy * 88 }, { x: ship.x + dx * 72, y: ship.y + dy * 72 }));
    const wave = s.sim.waves[0];
    assert.equal(wave.kind, 'directional');
    story.hit(ship, wave, Math.cos(wave.angle), Math.sin(wave.angle));
    const damage = ship.maxHp - ship.hp;
    story.hit(ship, wave, Math.cos(wave.angle), Math.sin(wave.angle));
    assert.equal(ship.maxHp - ship.hp, damage, 'Satu ombak hanya mengenai sekali');
    return { damage, shove: Math.hypot(ship.vx, ship.vy) };
  };
  const bow = hit(1, 0);
  const flank = hit(0, 1);
  const stern = hit(-1, 0);
  assert.ok(bow.damage > 0 && bow.damage < flank.damage / 2);
  assert.ok(bow.shove > 0 && bow.shove < flank.shove / 2);
  assert.deepEqual(stern, flank);
  ship.rotation = 0;
  assert.deepEqual(hit(-1, 0), bow);
});

test('Kapal Isyarat mempercepat kapal yang mendekat dalam jangkauan', () => {
  seedRandom(13);
  const s = new Session(new MemoryStore(), 'diam');
  const story = s.sim.story;
  const ally = story.spawnPirate(PIRATE_KIND.raider, 0, true);
  const signal = story.spawnPirate(PIRATE_KIND.signal, 0, true);
  const speed = (): number => {
    Object.assign(ally, { x: 800, y: 420, vx: 0, vy: 0 });
    story.move(ally, DT);
    return Math.hypot(ally.vx, ally.vy);
  };
  Object.assign(signal, { x: 935, y: 420 });
  const boosted = speed();
  signal.x = 1100;
  const unboosted = speed();
  assert.ok(boosted > unboosted * 1.2);
  signal.x = 935;
  story.sendOff(signal);
  assert.equal(speed(), unboosted);
});

test('varian lama dan baru tetap utuh di simpanan, termasuk muatan Rongsok dan arah Perisai', () => {
  seedRandom(14);
  const store = new MemoryStore();
  const init = createInitialProgress(true);
  const oldKinds = [PIRATE_KIND.raider, PIRATE_KIND.skiff, PIRATE_KIND.heavy] as const;
  init.story.day = init.story.chapter = 4;
  init.story.cycle = 'night';
  init.story.pirates = oldKinds.map((variant, i) => ({
    variant, x: 1210, y: 170 + i * 150, hp: 24, maxHp: 48, anchorIdx: i,
    tag: 'approach', attackWork: 0, speed: 50, dmg: 9, bounty: 18,
  }));
  saveGame(store, init);
  const s = new Session(store, 'diam');
  const story = s.sim.story;
  assert.deepEqual(story.activePirates().map((e) => e.variant), oldKinds);
  assert.ok(story.activePirates().every((e) => e.rotation === Math.PI && e.hp === 24));

  s.progress.story.wavePlan = buildNightWave(4).plan;
  const shield = story.spawnPirate(PIRATE_KIND.shield, 0, true);
  Object.assign(shield, { x: 450, y: 469, rotation: 2.1, tag: 'attack', attackWork: 0.6, hp: 37 });
  const dumper = story.spawnPirate(PIRATE_KIND.dumper, 1, true);
  const signal = story.spawnPirate(PIRATE_KIND.signal, 2, true);
  const pollution = s.progress.story.pollution;
  Object.assign(dumper, { x: 1280, y: 380, rotation: Math.PI });
  story.move(dumper, DT);
  assert.equal(dumper.pirateDumpTime, undefined);
  assert.equal(s.progress.story.pollution, pollution);
  dumper.x = 1010;
  for (let i = 0; i < 114; i++) story.move(dumper, DT);
  assert.equal(s.progress.story.pollution, pollution + P_TRASH);

  const restored = reload(s);
  invariant(s);
  const restoredStory = restored.sim.story;
  assert.deepEqual(restoredStory.activePirates().map((e) => e.variant), [...oldKinds, ...SPECIAL_PIRATES]);
  assert.deepEqual(restoredStory.s.wavePlan.map((p) => p.variant), story.s.wavePlan.map((p) => p.variant));
  assert.equal(restoredStory.activePirates().find((e) => e.variant === PIRATE_KIND.signal)?.hp, signal.hp);
  const savedShield = restoredStory.activePirates().find((e) => e.variant === PIRATE_KIND.shield)!;
  assert.equal(savedShield.rotation, 2.1);
  assert.equal(savedShield.attackWork, 0.6);
  assert.equal(savedShield.hp, 37);
  restoredStory.spawnPirate(PIRATE_KIND.shield, 5, true);
  assert.ok(!restored.radio.some((line) => line.includes(PIRATE_SPECS[PIRATE_KIND.shield].intro!)));
  const labels = platesFor(restored.sim).map((p) => p.text);
  for (const variant of [...oldKinds, ...SPECIAL_PIRATES]) assert.ok(labels.includes(PIRATE_SPECS[variant].name));

  const savedDumper = restoredStory.activePirates().find((e) => e.variant === PIRATE_KIND.dumper)!;
  assert.equal(savedDumper.pirateDumpTime, dumper.pirateDumpTime);
  restoredStory.move(savedDumper, DT);
  assert.equal(restoredStory.s.pollution, pollution + P_TRASH, 'Muatan pertama tidak diulang setelah memuat simpanan');
  for (let i = 0; i < 150; i++) restoredStory.move(savedDumper, DT);
  assert.equal(restoredStory.s.pollution, pollution + P_TRASH * 2);
  const trash = restored.sim.entities.find((e) => e.kind === 'trash_bag' && e.pollution === P_TRASH);
  assert.ok(trash);
  Object.assign(trash, COLLECTOR_NET);
  restored.step(DT);
  assert.equal(restoredStory.s.pollution, pollution + P_TRASH, 'Jaring mengangkat kembali sampah yang dibuang');
  invariant(restored);
});

test('Jalur Pasang dari peti: satu arus, masa aktif dan jeda bertahan setelah dimuat', () => {
  const store = new MemoryStore();
  saveGame(store, createInitialProgress(true));
  const s = new Session(store, 'diam');
  const from = { x: 700, y: 355 }, to = { x: 950, y: 355 };
  assert.ok(s.swipe(from, to, 0.44));
  const crate = s.sim.addTrash('trash_crate', 900, 355);
  crate.vx = 0;
  s.step(DT);
  assert.ok(crate.vx > 0);
  assert.ok(s.swipe(from, to, 0.44));
  assert.equal(s.progress.totalCurrents, 1);
  const loaded = reload(s);
  assert.deepEqual(loaded.sim.tidalLane, s.sim.tidalLane);
  loaded.runFor(3.1);
  assert.equal(loaded.sim.tidalLane, undefined);
  assert.ok(loaded.sim.laneCooldown > 4);
  loaded.runFor(5);
  assert.ok(loaded.swipe(from, to, 0.44));
  assert.equal(loaded.progress.totalCurrents, 2);
});

test('Tali tongkang putus oleh sapuan samping dan melepas tiga peti sekali', () => {
  const s = new Session(new MemoryStore(), 'diam');
  const tug = s.sim.story.spawnPirate(PIRATE_KIND.tug, 0, false);
  Object.assign(tug, { x: 800, y: 400, rotation: Math.PI });
  const crates = () => s.sim.entities.filter(e => e.kind === 'trash_crate').length;
  const before = crates();
  assert.ok(s.swipe({ x: 865, y: 378 }, { x: 865, y: 470 }));
  s.runFor(0.2);
  assert.equal(tug.tag, 'leaving');
  assert.equal(crates(), before + 3);
  s.runFor(0.2);
  assert.equal(crates(), before + 3);
});

test('Pendobrak mengunci arah dua detik, oleng di karang, dan bambu menahan satu hantaman', () => {
  const s = new Session(new MemoryStore(), 'diam');
  const story = s.sim.story;
  const ram = story.spawnPirate(PIRATE_KIND.rammer, 0, true);
  Object.assign(ram, { x: 1130, y: 246 });
  story.move(ram, DT);
  assert.equal(ram.ram?.phase, 'aim');
  const angle = ram.ram!.angle;
  ram.y += 22;
  story.move(ram, 1);
  assert.equal(ram.ram!.angle, angle);
  story.move(ram, 1.1);
  assert.equal(ram.ram!.phase, 'rush');
  Object.assign(ram, { x: 1075, y: 246 });
  story.move(ram, DT);
  assert.equal(ram.ram!.phase, 'stun');
  story.s.marks.fender = 1;
  story.damagePier(12, 500, 400);
  assert.equal(story.s.pierHp, 100);
  story.damagePier(12, 500, 400);
  assert.equal(story.s.pierHp, 88);
});

test('Simpanan siang lama menjaga proporsi waktu dan tingkat jalur pengganti', () => {
  const store = new MemoryStore();
  const old = createInitialProgress(true);
  delete old.story.marks.shortDays;
  old.story.dayTime = 100;
  const upgrades = { ...old.upgrades, resonance_burst: 2 } as Record<string, number>;
  delete upgrades.tidal_lane;
  store.setItem(SAVE_KEY, JSON.stringify({ ...old, upgrades }));
  const loaded = loadGame(store).progress;
  assert.equal(loaded.story.dayTime, 60);
  assert.equal(loaded.upgrades.tidal_lane, 2);
  saveGame(store, loaded);
  assert.equal(loadGame(store).progress.story.dayTime, 60);
});

test('Perahu terakhir melewati serbuan dan kedua alat muson rusak sebelum kemenangan', () => {
  seedRandom(1);
  const s = new Session(new MemoryStore(), 'biasa');
  let escort = false, trawl = false, drum = false;
  s.runFor(20 * 60, () => {
    const st = s.progress.story;
    if (st.marks.lastBoat && st.job?.kind === 'boat') escort = true;
    if (st.job?.kind === 'boss') {
      trawl ||= st.job.seen.trawl;
      drum ||= st.job.seen.drum;
    }
    return st.defeated || s.endingAt >= 0;
  });
  assert.ok(escort && trawl && drum && s.endingAt >= 0);
});

console.log(`\n${passed} lulus, ${failed} gagal.`);
if (failed) process.exitCode = 1;
