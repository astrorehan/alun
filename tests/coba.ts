import { MemoryStore, seedRandom, Session, type Style } from './bot';

const styles = (process.env.GAYA ?? 'biasa,tanpa,sejuta').split(',') as Style[];
const seeds = (process.env.SEED ?? '1').split(',').map(Number);
for (const style of styles) {
  for (const seed of seeds) {
    seedRandom(seed);
    const s = new Session(new MemoryStore(), style, style === 'sejuta' ? 1_000_000 : 0);
    s.runFor(60 * 30, () => s.endingAt >= 0);
    const mm = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    console.log(`\n== ${style} seed ${seed}: tamat ${s.endingAt < 0 ? 'TIDAK' : mm(s.endingAt)} · koin ${s.progress.coins} · total ${s.progress.totalCoinsEarned} · P terburuk ${s.worstP} · menit terbaik ${s.bestMinute()}`);
    console.log('bab', s.chapters.map((c) => `${c.n}@${mm(c.at)}`).join(' '), '· bengkel', mm(s.workshop));
    console.log('kerja', s.jobs().map((j) => `${j.kind}:${j.result}:${j.pay}@${mm(j.at)}`).join(' '));
    console.log('beli', s.bought.slice(0, 14).map((b) => `${b.id}${b.level}@${mm(b.at)}`).join(' '));
    console.log('per menit', s.perMinute().join(','), '· pulih', s.progress.story.recoveries.join(','));
    if (s.endingAt < 0) console.log('berhenti di', s.progress.story.chapter, s.progress.story.step, JSON.stringify(s.progress.story.job), s.sim.story.objective());
    if (s.violations.length) console.log('PELANGGARAN', s.violations.slice(0, 8));
  }
}
