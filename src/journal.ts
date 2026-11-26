import type { PlayerProgress } from './types';
import type { UiIconName } from './ui-kit/icons';
import type { UiSwatch } from './ui-kit/templates';

/** The village journal: what happened, written down. It pays nothing. */
export interface JournalEntry {
  id: string;
  part: 'cerita' | 'patroli';
  title: string;
  /** The note, once it has happened. */
  note: string;
  /** What the page says until then. */
  hint: string;
  icon: UiIconName;
  swatch: UiSwatch;
  target: number;
  value: (p: PlayerProgress) => number;
}

const yes = (b: boolean): number => (b ? 1 : 0);

export const JOURNAL: JournalEntry[] = [
  {
    id: 'dermaga',
    part: 'cerita',
    title: 'Dermaga terbuka',
    note: 'Enam sampah rombongan wisata masuk Jaring Desa. Jalur pulang terlihat lagi.',
    hint: 'Sapu enam sampah yang menutup dermaga.',
    icon: 'net',
    swatch: 'orange',
    target: 6,
    value: (p) => 6 - p.story.openingLeft,
  },
  {
    id: 'peti',
    part: 'cerita',
    title: 'Peti perkakas kembali',
    note: 'Bu Sari memasang lagi perkakasnya. Bengkel Kalibrasi buka.',
    hint: 'Dorong peti berlambang kunci pas ke ujung dermaga.',
    icon: 'wrench',
    swatch: 'gold',
    target: 1,
    value: (p) => yes(p.story.flags.toolbox),
  },
  {
    id: 'induk',
    part: 'cerita',
    title: 'Induk lumba-lumba bebas',
    note: 'Tali peti berujung di karang. Tiga lilitan robek, induk lolos lewat celah, dan pelampung bergaris itu dikenali.',
    hint: 'Bebaskan induk lumba-lumba dari jaring di ujung tali peti.',
    icon: 'dolphin',
    swatch: 'teal',
    target: 1,
    value: (p) => yes(p.story.flags.dolphin),
  },
  {
    id: 'bibit',
    part: 'cerita',
    title: 'Bibit pertama',
    note: 'Satu mangrove berdiri di tepian. Akarnya mulai menahan kotoran.',
    hint: 'Sapu bibit dari Bu Sari ke tepi kiri.',
    icon: 'mangrove',
    swatch: 'green',
    target: 1,
    value: (p) => p.mangroves.length,
  },
  {
    id: 'damar',
    part: 'cerita',
    title: 'Pak Damar merapat',
    note: 'Arus silang dilewati. Dua keranjang ikan dan kumparan pasang turun di dermaga.',
    hint: 'Bantu perahu pertama lewat celah karang.',
    icon: 'boat',
    swatch: 'blue',
    target: 1,
    value: (p) => yes(p.story.flags.damar),
  },
  {
    id: 'muatan',
    part: 'cerita',
    title: 'Muatan terjaga',
    note: 'Layar robek pulang tanpa hasil penuh. Warga mulai berjaga di dermaga.',
    hint: 'Selamatkan sedikitnya satu keranjang.',
    icon: 'basket',
    swatch: 'orange',
    target: 1,
    value: (p) => yes(p.story.flags.cargo),
  },
  {
    id: 'pukat',
    part: 'cerita',
    title: 'Kawanan lolos',
    note: 'Pukat kendur di tempat ikan bertelur. Kini jelas siapa yang meninggalkan jaring di karang.',
    hint: 'Sapu pelampung bergaris keluar dari jalur ikan.',
    icon: 'float',
    swatch: 'blue',
    target: 1,
    value: (p) => yes(p.story.flags.trawl),
  },
  {
    id: 'minyak',
    part: 'cerita',
    title: 'Batu kembali bersih',
    note: 'Bercak lama terserap bantalan. Warga menyimpan perlengkapan pemulihan di dermaga.',
    hint: 'Halau kapal drum, lalu serap bercaknya.',
    icon: 'pad',
    swatch: 'teal',
    target: 1,
    value: (p) => yes(p.story.flags.waste),
  },
  {
    id: 'anak',
    part: 'cerita',
    title: 'Induk dan anak lewat',
    note: 'Jalur ikan yang dulu diselamatkan kini dilewati dua lumba-lumba.',
    hint: 'Singkirkan jaring hanyut dari jalur mereka.',
    icon: 'dolphin',
    swatch: 'green',
    target: 1,
    value: (p) => yes(p.story.flags.calf),
  },
  {
    id: 'suar',
    part: 'cerita',
    title: 'Suar menyala',
    note: 'Bekal jaga malam sampai. Cahaya suar kelihatan dari laut lepas.',
    hint: 'Jaga bekal Pak Damar dari penjarah.',
    icon: 'beacon',
    swatch: 'gold',
    target: 1,
    value: (p) => yes(p.story.flags.night),
  },
  {
    id: 'muson',
    part: 'cerita',
    title: 'Kapal induk mundur',
    note: 'Pukat dan drumnya gagal, lambungnya kena. Armada itu pergi sebelum badai usai.',
    hint: 'Jawab radio bengkel dan hadapi kapal induk.',
    icon: 'boss',
    swatch: 'red',
    target: 1,
    value: (p) => yes(p.story.flags.boss),
  },
  {
    id: 'fajar',
    part: 'cerita',
    title: 'Fajar di dermaga',
    note: 'Perahu Pak Damar bersandar di tempat yang dulu tertutup sampah.',
    hint: 'Pulihkan pantai setelah badai.',
    icon: 'dawn',
    swatch: 'purple',
    target: 1,
    value: (p) => yes(p.story.flags.ending),
  },
  {
    id: 'bersih',
    part: 'patroli',
    title: 'Pantai bersih',
    note: 'Kesehatan pesisir pernah sampai sembilan puluh.',
    hint: 'Naikkan kesehatan pesisir sampai 90%.',
    icon: 'eco',
    swatch: 'green',
    target: 90,
    value: (p) => Math.round(100 - p.story.pollution),
  },
  {
    id: 'rongsok',
    part: 'patroli',
    title: 'Tiga ratus rongsok',
    note: 'Tiga ratus benda tidak jadi sampah di pantai.',
    hint: 'Sapu tiga ratus rongsok ke Jaring Desa.',
    icon: 'net',
    swatch: 'blue',
    target: 300,
    value: (p) => p.totalTrash,
  },
  {
    id: 'barisan',
    part: 'patroli',
    title: 'Barisan mangrove',
    note: 'Enam batang berjajar. Sampah di dekatnya tidak lagi menempel di pasir.',
    hint: 'Tumbuhkan enam mangrove.',
    icon: 'mangrove',
    swatch: 'teal',
    target: 6,
    value: (p) => p.mangroves.length,
  },
  {
    id: 'penjaga',
    part: 'patroli',
    title: 'Penjaga dermaga',
    note: 'Dua puluh keranjang pulang ke dapur warga.',
    hint: 'Selamatkan dua puluh keranjang dari penjarah.',
    icon: 'basket',
    swatch: 'orange',
    target: 20,
    value: (p) => p.story.saved.baskets,
  },
  {
    id: 'sahabat',
    part: 'patroli',
    title: 'Sahabat lumba-lumba',
    note: 'Lima kali jalur mereka dibuka. Mereka tidak lagi takut pada A.L.U.N.',
    hint: 'Bantu lumba-lumba lima kali.',
    icon: 'dolphin',
    swatch: 'blue',
    target: 5,
    value: (p) => p.story.saved.dolphins,
  },
  {
    id: 'endapan',
    part: 'patroli',
    title: 'Di bawah pasir',
    note: 'Tiga endapan lama terangkat dari tepi pantai.',
    hint: 'Angkat tiga endapan yang ditunjuk nelayan.',
    icon: 'eco',
    swatch: 'gold',
    target: 3,
    value: (p) => p.story.saved.deposits,
  },
  {
    id: 'relik',
    part: 'patroli',
    title: 'Temuan bagus',
    note: 'Empat puluh peti, baterai dan relik masuk gudang desa.',
    hint: 'Kumpulkan empat puluh peti, baterai atau relik.',
    icon: 'rarity',
    swatch: 'purple',
    target: 40,
    value: (p) => p.totalRareTrash,
  },
  {
    id: 'rimba',
    part: 'patroli',
    title: 'Rimba selamat',
    note: 'Dua kali api di tepi hutan padam sebelum menjalar.',
    hint: 'Padamkan dua api di tepi hutan.',
    icon: 'fire',
    swatch: 'red',
    target: 2,
    value: (p) => p.totalFires,
  },
];

export function isWritten(e: JournalEntry, p: PlayerProgress): boolean {
  return e.value(p) >= e.target || p.journalSeen.includes(e.id);
}

/** Pages written since the journal was last opened. */
export function unreadPages(p: PlayerProgress, part?: JournalEntry['part']): JournalEntry[] {
  return JOURNAL.filter((e) => (!part || e.part === part) && e.value(p) >= e.target && !p.journalSeen.includes(e.id));
}

/** Remembers the pages of this part that are written now; a page once written stays, whatever happens after. */
export function markRead(p: PlayerProgress, part: JournalEntry['part']): void {
  for (const e of unreadPages(p, part)) p.journalSeen.push(e.id);
}
