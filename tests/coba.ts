import { MemoryStore, seedRandom, Session, type Style } from './bot';

const styles = (process.env.GAYA ?? 'biasa,tanpa,sejuta').split(',') as Style[];
const seeds = (process.env.SEED ?? '1').split(',').map(Number);
for (const style of styles) {
  for (const seed of seeds) {
    seedRandom(seed);
    const s = new Session(new MemoryStore(), style, style === 'sejuta' ? 1_000_000 : 0);
    s.runFor(60 * 24, () => s.endingAt >= 0 || s.defeatedAt >= 0);
    const mm = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const status = s.endingAt >= 0 ? `MENANG@${mm(s.endingAt)}` : s.defeatedAt >= 0 ? `KALAH@${mm(s.defeatedAt)}` : `HARI ${s.progress.story.day}`;
    console.log(`\n== ${style} seed ${seed}: ${status} · koin ${s.progress.coins} · total ${s.progress.totalCoinsEarned} · kapal ${s.progress.story.piratesSunk} · HP min ${s.minPierHp} · resonansi ${s.progress.totalResonances}`);
    console.log('hari', s.days.map((d) => `H${d.n}@${mm(d.at)}`).join(' '), '· bengkel', mm(s.workshop));
    console.log('beli', s.bought.slice(0, 18).map((b) => `${b.id}${b.level}@${mm(b.at)}`).join(' '));
    if (s.violations.length) console.log('PELANGGARAN', s.violations.slice(0, 8));
  }
}
