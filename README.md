# ALUN: Gema Pesisir Tropis

Game incremental satu mekanik di laguna tropis. Sapu ombak, dorong sampah ke jaring desa, lalu pulihkan pesisir sampai terumbu karang berwarna lagi. Dibuat untuk **IT RUSH 2026 Game Jam (Universitas Bengkulu)**, tema *Only One Mechanics in a Tropical*.

![Laguna di pagi hari](docs/main.jpg)

| Senja | Badai muson |
|---|---|
| ![Senja](docs/sunset.jpg) | ![Badai muson](docs/badai.jpg) |

## Cara main

Semua dilakukan dengan satu gerakan: **klik dan geser di air** untuk mengirim ombak. Tahan sebelum dilepas untuk mengisi gelombang pasang.

| Input | Fungsi |
|---|---|
| Klik + geser | Kirim ombak |
| Tahan, lalu lepas | Gelombang pasang besar |
| Tab / E | Buka Kalibrasi (upgrade) |
| 1 / 2 / 3 | Ganti tab Kalibrasi |
| G | Pengaturan grafis |
| M | Suara |

Koin dari sampah dipakai untuk upgrade. Waktu hari dan kesehatan laguna berubah mengikuti kemajuan, dari pagi sampai badai muson dan kapal limbah.

## Menjalankan

Butuh Node.js 20 atau lebih baru.

```bash
npm install
npm run dev      # server pengembangan
npm run build    # hasil di dist/
npm run preview  # mencoba hasil build
```

Game butuh browser dengan WebGL2 (Chrome, Edge, atau Firefox terbaru). `lab.html` hanya untuk pengembangan: mengatur waktu hari, kesehatan laguna, dan mencoba cutscene.

## Pengaturan grafis

Otomatis, Rendah, Sedang, Tinggi, dan Ultra, bisa diganti saat bermain. Rendah dan Sedang menyimpan latar statis di resolusi asli dan hanya menggambar ulang air serta objek bergerak, jadi tetap tajam di GPU terintegrasi.

Pengukuran di 1919x948:

| GPU | Tier | Diam | Saat ombak |
|---|---|---|---|
| Intel UHD (16 EU) | Rendah | 71 fps | 67 fps |
| Intel UHD (16 EU) | Sedang (tanpa vsync) | 48 fps | 41 fps |
| RTX 4050 Laptop | Tinggi | 141 fps | 129 fps |

## Struktur

| Path | Isi |
|---|---|
| `src/simulation.ts` | Simulasi: ombak, sampah, jaring, kapal, cuaca |
| `src/upgrades.ts`, `src/achievements.ts` | Upgrade dan pencapaian |
| `src/audio.ts` | Suara yang disintesis dengan Web Audio |
| `src/ui.ts`, `src/ui-kit/` | Antarmuka |
| `src/scene/` | Renderer 3D, air, hutan, terumbu, desa, post-processing, cutscene |
| `src/scene/quality.ts` | Definisi tier grafis |
| `concepts/` | Klip adegan 3D dan contoh UI kit |

Simulasi berjalan di bidang 2D dan terpisah dari renderer.

## Pustaka dan font

- [Three.js](https://threejs.org), lisensi MIT
- [Fredoka](https://fonts.google.com/specimen/Fredoka) dan [Nunito](https://fonts.google.com/specimen/Nunito), SIL Open Font License

Pekerjaan yang belum selesai ada di tab [Issues](../../issues).
