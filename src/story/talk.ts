/**
 * What Bu Sari tells the player when the story stops for her: the first steps, and the moments
 * that say what is going on in the lagoon. She does not read her lines aloud: each one opens
 * with a short exclamation in her own voice for its mood ("Aduh, aduh...", "Eh! Eh, eh!"),
 * recorded by `npm run generate:voice`, and the words are typed while she talks. Everyone else,
 * and Bu Sari the rest of the time, talks in short written radio lines.
 */

export type Speaker = 'BU SARI' | 'PAK DAMAR' | 'A.L.U.N.' | 'PENJAGA RIMBA';

/** The feeling a line is said with; it picks the exclamation that opens it. */
export type Mood = 'ngobrol' | 'senang' | 'kaget' | 'cemas' | 'teriak' | 'bisik' | 'lega' | 'sedih';

export interface TalkLine {
  who: Speaker;
  text: string;
  mood?: Mood;
}

export interface Scene {
  lines: TalkLine[];
  /** False for a quick remark over play. Otherwise the lagoon waits until the player clicks on. */
  hold?: boolean;
}

const sari = (text: string, mood: Mood = 'ngobrol'): TalkLine => ({ who: 'BU SARI', text, mood });

export const SCENES = {
  /** A.L.U.N. has just woken up. */
  wake: {
    lines: [
      sari('Eh, eh... nyala nyo! La tigo malam kuketok pakai kunci inggris, baru sekarang ndak bangun.', 'kaget'),
      sari('Dengar. Turis-turis tadi buang sampah seenaknyo. Dermaga jadi ketutup, jadinya Pak Damar dak bisa pulang.', 'cemas'),
      sari('Nah kau cubo klik di air, geser ke sampahnya, lepas. Cak nyapu lantai, tapi iko lantainya laut.'),
    ],
  },
  /** The first piece of rubbish lands in the net. */
  firstCatch: {
    hold: false,
    lines: [sari('Nah, kan! Masuk jaring nyo. Bagus nian. Terus, terus.', 'senang')],
  },
  /** The last of it is gone and her toolbox turns up at the mooring. */
  chest: {
    lines: [sari('Eh, itu peti perkakas ibuk! Kok bisa nyo nyangkut di situ... ah, sudahlah. Tolong dorong ke ujung dermaga.', 'kaget')],
  },
  /** The toolbox is home: the workshop opens. */
  workshop: {
    lines: [
      sari('Bengkel buka! Rongsok yang kamu kumpulin ibu tukar jadi alat. Jangan tanya caranya. Rahasia dapur.', 'senang'),
      sari('Tombolnyo di kanan bawah tu. Pasang Muatan dulu, biar rongsok yang hanyut makin banyak.'),
    ],
  },
  /** Out of the workshop for the first time: how a day goes. */
  dayOne: {
    lines: [
      sari('Nah, mulai hari ini kau sapu rongsok sebanyak-banyaknyo. Rongsok jadi koin, koin jadi alat.'),
      sari('Coba Jalur Pasang. Tahan sampai tiga panah muncul, geser lalu lepas. Arusnyo bantu kau tiga detik.', 'lega'),
    ],
  },
  /** The first pirate scout comes in by day. */
  scout: {
    lines: [
      sari('Eh, eh, kapal layar robek! Itu pengintai bajak laut.', 'kaget'),
      sari('Geser ombak ke arah kapalnyo. Dorong dio jauh-jauh dari dermaga!', 'teriak'),
    ],
  },
  /** The first pirate turns back and drops what it carried. */
  loot: {
    hold: false,
    lines: [sari('Kabur dio! Eh, ado yang jatuh dari kapalnyo. Pungut. Rezeki dak boleh ditolak.', 'senang')],
  },
  /** The first dusk: what the lights beyond the reef are. */
  dusk: {
    lines: [
      sari('Lampu-lampu di luar karang itu... bukan nelayan. Malam ini mereka ke sini.', 'bisik'),
      sari('Kalau nak belanja, sekarang lah. Begitu gelap, bengkel ibu tutup.'),
    ],
  },
  /** The first night is over. */
  dawn: {
    lines: [
      sari('La pagi... Dermaga masih berdiri. Syukurlah.', 'lega'),
      sari('Tapi tiap malam mereka datang makin banyak. Perkuat alat kau di bengkel, ya.'),
    ],
  },
  /** The mother dolphin is caught in a ghost net. */
  dolphin: {
    lines: [
      sari('Ya Allah... induk lumba-lumba tu terjerat jaring hantu.', 'sedih'),
      sari('Kirim ombak ikut panah tu, sampai lilitannyo putus semua.', 'cemas'),
    ],
  },
  /** The dolphin is free, and leaves a mangrove seedling behind. */
  seedling: {
    lines: [
      sari('Bebas dio! Tengok tu, la berenang lagi.', 'senang'),
      sari('Eh, ado bibit bakau hanyut. Sapu ke pantai kiri, biar tumbuh. Bakau tu nahan sampah.'),
    ],
  },
  /** The morning before the monsoon night. */
  storm: {
    lines: [
      sari('Langit di barat tu hitam nian... Muson datang malam ini.', 'bisik'),
      sari('Kapal induk bajak laut ikut masuk. Habiskan koin kau di bengkel, jangan disimpan-simpan!', 'cemas'),
    ],
  },
  /** The mothership enters with the storm. */
  mothership: {
    lines: [sari('Itu dio kapal induknyo! Pecahkan alat di geladaknyo dulu, baru hantam lambungnyo!', 'teriak')],
  },
  /** The mothership turns back. */
  bossDown: {
    lines: [sari('Kabur dio! Badai reda... Pak Damar, kau dengar? Pulanglah!', 'senang')],
  },
  /** New kinds of ship, the first time each one comes. */
  shield: {
    lines: [sari('Kapal perisai! Depannyo keras, ombak mental. Sapu dari samping atau belakang!', 'teriak')],
  },
  dumper: {
    lines: [sari('Kapal rongsok! Dio buang sampah sepanjang jalan. Usir kapalnyo, baru sapu sampahnyo ke jaring.', 'cemas')],
  },
  signal: {
    lines: [sari('Kapal isyarat tu bikin kapal lain makin laju. Dorong dio jauh dari rombongannyo!', 'kaget')],
  },
} satisfies Record<string, Scene>;

export type SceneId = keyof typeof SCENES;
