import type { PlayerProgress } from './types';
import type { UiIconName } from './ui-kit/icons';
import type { UiSwatch } from './ui-kit/templates';

/** A leaf in Bu Sari's journal, with a pencil note until the event is recorded. */
export interface JournalEntry {
  id: string;
  part: 'cerita' | 'patroli';
  date: string;
  title: string;
  note: string;
  hint: string;
  icon: UiIconName;
  swatch: UiSwatch;
  target: number;
  value: (p: PlayerProgress) => number;
  tally?: { label: string; unit?: '%' };
}

const yes = (b: boolean): number => (b ? 1 : 0);

export const JOURNAL: JournalEntry[] = [
  {
    id: 'dermaga',
    part: 'cerita',
    date: 'Hari 1 · Pagi',
    title: 'Dermaga terbuka',
    note: 'Pagi ini enam rongsok masuk Jaring Desa. Dari ujung dermaga, kulihat air akhirnya mengalir lagi.',
    hint: 'Enam rongsok menyumbat jalur perahu. Sapu semuanya ke Jaring Desa.',
    icon: 'net',
    swatch: 'orange',
    target: 6,
    value: (p) => 6 - p.story.openingLeft,
    tally: { label: 'Rongsok tersapu' },
  },
  {
    id: 'peti',
    part: 'cerita',
    date: 'Hari 1 · Bengkel',
    title: 'Peti sampai juga',
    note: 'Kukira peti perkakasku akan hanyut. Begitu sampai, langsung kubuka bengkel. Sekarang kita bisa merakit alat untuk A.L.U.N.',
    hint: 'Peti perkakasku masih terapung. Tolong dorong ke ujung dermaga.',
    icon: 'wrench',
    swatch: 'gold',
    target: 1,
    value: (p) => yes(p.story.flags.toolbox),
  },
  {
    id: 'induk',
    part: 'cerita',
    date: 'Terumbu',
    title: 'Tiga lilitan putus',
    note: 'Dari ujung dermaga kulihat induk lumba-lumba naik mengambil napas. Akhirnya lepas juga dia dari jaring itu.',
    hint: 'Ada induk lumba-lumba terjerat di karang. Kirim ombak untuk memutus ketiga lilitannya.',
    icon: 'dolphin',
    swatch: 'teal',
    target: 1,
    value: (p) => yes(p.story.flags.dolphin),
  },
  {
    id: 'damar',
    part: 'cerita',
    date: 'Arus silang',
    title: 'Perahu Pak Damar',
    note: 'Pak Damar akhirnya merapat. Tadi perahunya nyaris kandas. Sekarang dia sudah tertawa sambil mengangkat bakul ikan.',
    hint: 'Kalau perahu Pak Damar terseret arus, arahkan ombak menjauhi batu karang.',
    icon: 'boat',
    swatch: 'blue',
    target: 1,
    value: (p) => Math.max(yes(p.story.flags.damar), p.totalBoats),
  },
  {
    id: 'malam1',
    part: 'cerita',
    date: 'Malam 1',
    title: 'Lampu masih menyala',
    note: 'Sepanjang malam aku cemas mendengar papan berderak. Saat fajar, layar robek sudah pergi. Lampu dermaga masih menyala.',
    hint: 'Layar robek datang selepas senja. Jaga dermaga sampai fajar pertama.',
    icon: 'moon',
    swatch: 'blue',
    target: 1,
    value: (p) => p.story.nightsSurvived,
  },
  {
    id: 'pukat',
    part: 'cerita',
    date: 'Jalur ikan',
    title: 'Ikan kembali ke karang',
    note: 'Begitu pelampung belang tersapu, kulihat kawanan berbelok kembali ke karang. Tempat bertelur mereka aman.',
    hint: 'Kalau pukat masuk jalur ikan, sapu pelampung belangnya sebelum kawanan terseret.',
    icon: 'float',
    swatch: 'blue',
    target: 1,
    value: (p) => Math.max(yes(p.story.flags.trawl), p.story.saved.trawls),
  },
  {
    id: 'minyak',
    part: 'cerita',
    date: 'Karang dangkal',
    title: 'Warna karang kembali',
    note: 'Bantalan yang tadinya putih kuangkat dalam keadaan hitam. Di bawahnya, warna batu karang mulai kelihatan lagi.',
    hint: 'Kalau ada minyak di karang, dorong bantalan putih ke tumpahannya.',
    icon: 'pad',
    swatch: 'teal',
    target: 1,
    value: (p) => Math.max(yes(p.story.flags.waste), p.story.saved.spills),
  },
  {
    id: 'malam3',
    part: 'cerita',
    date: 'Malam 3',
    title: 'Tiga malam berjaga',
    note: 'Penjarah berat datang bersama kapal limbah. Saat fajar, aku masih bisa berjalan sampai ujung dermaga.',
    hint: 'Saat kapal limbah ikut menyerbu, pertahankan dermaga sampai fajar.',
    icon: 'shield',
    swatch: 'orange',
    target: 3,
    value: (p) => p.story.nightsSurvived,
    tally: { label: 'Malam terlewati' },
  },
  {
    id: 'muson',
    part: 'cerita',
    date: 'Malam 5 · Muson',
    title: 'Kapal Induk mundur',
    note: 'Di tengah hujan, Kapal Induk akhirnya berbalik. Baru setelah lampu-lampunya hilang aku berani duduk.',
    hint: 'Kapal Induk datang bersama badai. Pukul mundur kapal itu saat Malam 5.',
    icon: 'boss',
    swatch: 'red',
    target: 1,
    value: (p) => yes(p.story.flags.boss),
  },
  {
    id: 'fajar',
    part: 'cerita',
    date: 'Hari 6 · Fajar',
    title: 'Teh selepas badai',
    note: 'Kuseduh teh dan kubawa ke ujung dermaga. Badai sudah lewat. Mulai hari ini, kita jaga teluk lewat patroli.',
    hint: 'Jika kita bertahan sampai fajar Hari 6, teluk bisa dibuka lagi untuk patroli.',
    icon: 'dawn',
    swatch: 'purple',
    target: 1,
    value: (p) => yes(p.story.flags.ending),
  },
  {
    id: 'penghalau',
    part: 'patroli',
    date: 'Mulut teluk',
    title: 'Layar robek di kejauhan',
    note: 'Sudah lima puluh kapal bajak laut kita halau. Aku masih hafal bunyi kayu saat ombak pertama menghantam lambung mereka.',
    hint: 'Kalau layar robek muncul lagi, arahkan ombak ke lambungnya sebelum kapal sempat merapat.',
    icon: 'raider',
    swatch: 'red',
    target: 50,
    value: (p) => p.story.piratesSunk,
    tally: { label: 'Kapal dihalau' },
  },
  {
    id: 'resonansi',
    part: 'patroli',
    date: 'Ombak A.L.U.N.',
    title: 'Saat dua ombak bertemu',
    note: 'Dua puluh kali sudah ombak bertemu dan meledak. Dari bengkel, bunyinya seperti beduk dipukul dari bawah air.',
    hint: 'Coba pertemukan dua ombak untuk memicu Resonansi Konstruktif. Aku catat tiap kali berhasil.',
    icon: 'resonance',
    swatch: 'gold',
    target: 20,
    value: (p) => p.totalResonances,
    tally: { label: 'Resonansi terpicu' },
  },
  {
    id: 'bersih',
    part: 'patroli',
    date: 'Garis pantai',
    title: 'Air sebening kaca',
    note: 'Pesisir sudah pulih sampai 90%. Pagi ini aku bisa melihat ikan kecil berenang di antara tiang dermaga.',
    hint: 'Kalau sampah dan minyak terus kita angkat, air di bawah dermaga bisa jernih lagi.',
    icon: 'eco',
    swatch: 'green',
    target: 90,
    value: (p) => Math.round(100 - p.story.pollution),
    tally: { label: 'Kesehatan pesisir', unit: '%' },
  },
  {
    id: 'rongsok',
    part: 'patroli',
    date: 'Jaring Desa',
    title: 'Rongsok jadi modal',
    note: 'Sudah tiga ratus rongsok masuk jaring. Dari barang yang tadinya cuma menyumbat teluk, kita bisa beli perkakas lagi.',
    hint: 'Sapu rongsok ke Jaring Desa. Nanti kupilah mana yang bisa dijual untuk modal bengkel.',
    icon: 'net',
    swatch: 'blue',
    target: 300,
    value: (p) => p.totalTrash,
    tally: { label: 'Rongsok terangkat' },
  },
  {
    id: 'barisan',
    part: 'patroli',
    date: 'Tepi laguna',
    title: 'Akar di air dangkal',
    note: 'Kuhitung enam mangrove berdiri di pinggir teluk. Sampah mulai tersangkut di akarnya sebelum sampai ke pantai.',
    hint: 'Tanam mangrove di tepi laguna. Kalau akarnya sudah tumbuh, pohon itu bisa menahan sampah.',
    icon: 'mangrove',
    swatch: 'teal',
    target: 6,
    value: (p) => p.mangroves.length,
    tally: { label: 'Mangrove tumbuh' },
  },
  {
    id: 'relik',
    part: 'patroli',
    date: 'Meja bengkel',
    title: 'Temuan dari air',
    note: 'Empat puluh temuan langka sudah kita angkat. Di antara peti dan baterai, ada juga barang tua yang belum kukenal.',
    hint: 'Kalau ada peti, baterai, atau relik hanyut, kirim ke Jaring Desa. Aku ingin lihat isinya.',
    icon: 'rarity',
    swatch: 'purple',
    target: 40,
    value: (p) => p.totalRareTrash,
    tally: { label: 'Temuan langka' },
  },
  {
    id: 'endless10',
    part: 'patroli',
    date: 'Malam 10',
    title: 'Giliran jaga kesepuluh',
    note: 'Sudah sepuluh malam kita bertahan. Begitu terang, kupanggil Pak Damar untuk sarapan di dermaga.',
    hint: 'Selama kapal bajak laut masih datang, kita tetap bergiliran jaga sampai fajar.',
    icon: 'moon',
    swatch: 'gold',
    target: 10,
    value: (p) => p.story.nightsSurvived,
    tally: { label: 'Malam terlewati' },
  },
  {
    id: 'rimba',
    part: 'patroli',
    date: 'Tepi hutan',
    title: 'Bau kayu basah',
    note: 'Dua kali api naik dari tepi hutan. Setelah disapu ombak, tinggal bau kayu basah yang terbawa angin ke bengkel.',
    hint: 'Kalau terlihat asap di tepi hutan, segera kirim ombak ke titik apinya.',
    icon: 'fire',
    swatch: 'orange',
    target: 2,
    value: (p) => p.totalFires,
    tally: { label: 'Api dipadamkan' },
  },
];

export function isWritten(e: JournalEntry, p: PlayerProgress): boolean {
  return e.value(p) >= e.target || p.journalSeen.includes(e.id);
}

export function unreadPages(p: PlayerProgress, part?: JournalEntry['part']): JournalEntry[] {
  return JOURNAL.filter((e) => (!part || e.part === part) && e.value(p) >= e.target && !p.journalSeen.includes(e.id));
}

export function markRead(p: PlayerProgress, part: JournalEntry['part']): void {
  for (const e of unreadPages(p, part)) p.journalSeen.push(e.id);
}
