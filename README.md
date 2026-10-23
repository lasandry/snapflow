# Snapflow

Skill lintas-AI untuk membuat dokumentasi aplikasi web secara otomatis.

- Screenshot bersih setiap halaman atau langkah
- Video tutorial: kursor, ketikan natural, auto-zoom mengikuti kursor, subtitle gaya Netflix, logo brand, musik latar otomatis, bunyi klik, voice-over
- Siap YouTube dan Reels: chapter otomatis, thumbnail, dan klip pendek per fitur
- Data pribadi di-blur dan gangguan saat develop (Debugbar, banner cookie) disembunyikan otomatis
- Video uji coba: berjalan cepat, setiap langkah diverifikasi, laporan lulus/gagal
- Rasio bebas: 16:9, 9:16, 1:1, 4:5, dan lainnya, atau preset `youtube`, `reels`, `tiktok`
- Naskah voice-over per langkah, siap untuk TTS AI
- Dokumen Word (`.docx`) dengan sampul dan daftar isi, plus HTML, siap edit atau cetak PDF
- Bisa dipakai di Claude, Codex, Cursor, Gemini, dan AI lain, atau dijalankan manual

## Daftar isi

1. [Instalasi](#1-instalasi)
2. [Cara pakai](#2-cara-pakai)
3. [Hasil](#3-hasil)
4. [Fitur video & dokumen](#4-fitur-video--dokumen)
5. [Batasan](#5-batasan)

Ingin menjalankan tanpa AI atau mengatur detail (rasio, zoom, opsi lengkap)? Lihat [Panduan Manual](references/manual.md).

---

## 1. Instalasi

### Cara cepat (disarankan)

Satu perintah memasang semuanya: Node.js, ffmpeg, kode skill, paket npm, dan browser Chromium. Komponen yang sudah terpasang dilewati, jadi aman dijalankan berulang kali. Untuk update, jalankan perintah yang sama.

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/lasandry/snapflow/main/install.ps1 | iex
```

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/lasandry/snapflow/main/install.sh | bash
```

Lokasi default adalah `~/.claude/skills/snapflow` (Claude Code). Untuk lokasi lain, misalnya Codex:

```powershell
$env:SNAPFLOW_DIR = "$HOME\.codex\skills\snapflow"
irm https://raw.githubusercontent.com/lasandry/snapflow/main/install.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/lasandry/snapflow/main/install.sh | SNAPFLOW_DIR=~/.codex/skills/snapflow bash
```

### Lokasi skill untuk tiap AI

| AI / Tool | Lokasi folder `snapflow/` |
|---|---|
| **Claude Code** | `~/.claude/skills/snapflow/` (default installer) atau `<project>/.claude/skills/snapflow/` |
| **Claude.ai / Claude Desktop** | Zip folder ini, unggah di Settings → Capabilities → Skills |
| **OpenAI Codex CLI** | `~/.codex/skills/snapflow/`, atau di dalam repo project (Codex membaca `AGENTS.md`) |
| **Gemini CLI** | Di dalam project, lalu salin `AGENTS.md` sebagai `GEMINI.md` (atau atur `contextFileName` ke `AGENTS.md`) |
| **Cursor / Windsurf / Cline / Aider** | Di dalam project. `AGENTS.md` dibaca otomatis, atau rujuk `@snapflow/SKILL.md` di prompt |
| **Tanpa AI** | Di mana saja |

### Cara manual (tanpa installer)

1. Pasang Node.js 18+ dari [nodejs.org](https://nodejs.org).
2. Pasang ffmpeg:

   ```powershell
   winget install Gyan.FFmpeg        # Windows
   ```

   ```bash
   brew install ffmpeg               # macOS
   sudo apt install ffmpeg           # Ubuntu / Debian
   ```

3. Unduh skill dan pasang dependensinya (Chromium ikut terunduh):

   ```bash
   git clone https://github.com/lasandry/snapflow.git ~/.claude/skills/snapflow
   cd ~/.claude/skills/snapflow
   npm install
   ```

### Cek instalasi

Terminal 1, jalankan aplikasi contoh dan biarkan tetap terbuka:

```bash
cd ~/.claude/skills/snapflow
python -m http.server 8765 -d examples/demo-app
```

Terminal 2, rekam demo:

```bash
cd ~/.claude/skills/snapflow
cp examples/.env.example examples/.env
npm run demo
```

Instalasi berhasil bila muncul `Selesai: 6/6 langkah ok`. Hasilnya ada di `output/<tanggal_jam>/`.

---

## 2. Cara pakai

Buka AI (Claude Code, Codex, dll) di folder aplikasi Anda, lalu tulis permintaan dalam bahasa biasa. Sebut nama skill dan fitur yang ingin direkam.

Video tutorial:

```text
Pakai skill snapflow. Buat video tutorial aplikasi ini: login, buka dashboard, tambah data baru, lalu lihat laporannya. Hasilkan versi 16:9 dan 9:16 dengan subtitle.
```

Screenshot semua halaman:

```text
Pakai skill snapflow. Ambil screenshot semua halaman aplikasi ini setelah login, lalu buatkan dokumen Word-nya.
```

Konten Reels / TikTok (klip pendek per fitur):

```text
Pakai skill snapflow. Buat video 9:16 untuk Reels dari fitur tambah data dan laporan, lengkap dengan klip pendek per fitur.
```

Uji coba alur:

```text
Pakai skill snapflow mode test untuk alur checkout, lalu laporkan langkah yang gagal.
```

Ganti nama fitur sesuai aplikasi Anda. URL tidak perlu ditulis: Snapflow mendeteksi sendiri alamat aplikasi yang sedang berjalan, dan AI menyalakan server dev-nya bila belum berjalan.

Yang dikerjakan AI:

1. **Bertanya gaya video**: *clean* (tanpa teks) atau dengan subtitle, dan pakai musik + efek klik atau tidak (default: pakai).
2. **Menemukan aplikasi**: alamat aplikasi dideteksi otomatis. Bila server dev belum berjalan, AI menyalakannya sendiri.
3. **Mencari akun login sendiri** di `.env`, seeder, factory, README, atau tes aplikasi. AI baru bertanya bila tidak ketemu. Password disimpan di `snapflow/.env`, tidak ditulis di flow atau laporan.
4. **Menyusun flow** `snapflow/flow.json` (langkah, narasi, aksi klik/isi form) dengan membaca kode halaman. Sekaligus mencari logo dan warna brand, serta menandai kolom data pribadi untuk di-blur.
5. **Merekam dan merender** semua rasio: video, screenshot, thumbnail, chapter YouTube, dokumen Word/HTML, naskah voice-over, dan klip pendek bila diminta.
6. **Memeriksa hasil** (screenshot dan beberapa frame video). Bila ada langkah gagal, AI memperbaiki flow lalu menjalankan ulang.
7. **Melapor**: lokasi folder hasil, rasio, durasi, dan langkah yang gagal (jika ada).

---

## 3. Hasil

Hasil disimpan di folder `snapflow/` di dalam aplikasi Anda. Setiap run membuat folder bertanggal, isinya satu folder per platform:

```
snapflow/
├── flow.json                     # skenario rekaman
├── .env                          # akun login (jangan di-commit)
└── 2026-10-24_1430/
    ├── youtube/
    │   ├── tutorial-16x9.mp4     # video jadi (zoom, subtitle, musik, efek suara)
    │   ├── thumbnail-16x9.jpg    # sampul video
    │   ├── DOKUMENTASI.docx      # panduan Word dengan sampul + daftar isi
    │   ├── DOKUMENTASI.html      # versi web, satu file, Ctrl+P untuk simpan PDF
    │   ├── voiceover-16x9.txt    # naskah narasi + timestamp + nama file audio
    │   ├── voiceover-teks.txt    # teks narasi saja, untuk TTS AI
    │   └── raw/                  # bahan: rekaman mentah, screenshot, subtitle .srt,
    │                             #        chapter YouTube, file musik, manifest
    └── tiktok/                   # isi sama, versi 9:16
```

URL aplikasi tidak dicantumkan di dokumen maupun manifest. Bila memakai git, tambahkan ke `.gitignore` aplikasi:

```
snapflow/*/
snapflow/.env
```

---

## 4. Fitur video & dokumen

**Subtitle**: gaya Netflix. Teks putih tebal dengan outline hitam, maksimal 2 baris. Di 9:16 posisinya dinaikkan agar tidak tertutup tombol Reels/TikTok. Bila memilih video clean, subtitle tetap tersedia sebagai file `.srt`.

**Musik**: instrumental dibuat otomatis saat render (bebas royalti, aman diunggah), panjangnya mengikuti video.

| Gaya | Suasana | Cocok untuk |
|---|---|---|
| `lofi` (default) | santai, 80 BPM | tutorial, dokumentasi |
| `corporate` | ceria, 108 BPM | demo produk, promo, Reels |

**Efek suara**: bunyi klik mouse tepat saat kursor mengklik.

**Logo & warna brand**: AI mencari logo dan warna utama aplikasi sendiri, lalu memakainya di kartu pembuka, watermark video, thumbnail, dan sampul Word.

**Privasi**: kolom berisi data pribadi (email, NIK, nomor HP) di-blur. Laravel Debugbar, overlay error Vite/Next, dan banner cookie disembunyikan otomatis.

**Versi bahasa lain**:

```text
Pakai skill snapflow. Buatkan juga versi bahasa Inggris dari video tutorial tadi.
```

**Voice-over**:

1. Buka `voiceover-16x9.txt` di folder hasil. Setiap bagian sudah diberi nama file:
   ```
   [00:02 – 00:06] Login  → 01.mp3
   Pertama, masuk dengan email dan password akun Anda.
   ```
2. Buat audionya dengan TTS AI (ElevenLabs, dll) atau rekam sendiri, lalu simpan ke satu folder: `vo/00.mp3`, `vo/01.mp3`, …
3. Minta AI menggabungkannya. AI akan bertanya dulu apakah subtitle ikut ditanam, karena panjang suara bisa berbeda dari teks naskah:

   ```text
   Pakai skill snapflow. Gabungkan voice-over di folder vo ke video tutorial terakhir, versi 16:9 dan 9:16.
   ```

Narasi diletakkan tepat di awal langkahnya, dan musik otomatis mengecil saat narasi berbicara. Browser tidak perlu merekam ulang.

---

## 5. Batasan

- Hanya aplikasi web (Chromium). Aplikasi Android native di luar cakupan.
- Voice-over tidak dibuat otomatis: audio narasi dibuat sendiri (TTS AI atau rekaman), lalu digabung.
- Login dengan OTP/CAPTCHA perlu login manual sekali (lihat [Panduan Manual](references/manual.md#8-tips)).
- Situs dengan proteksi bot ketat bisa menolak browser otomatis.

---

## Struktur folder

```
snapflow/
├── SKILL.md                  # instruksi untuk Claude (format Agent Skills)
├── AGENTS.md                 # instruksi untuk Codex, Cursor, Gemini, dll
├── README.md                 # dokumen ini
├── LICENSE                   # lisensi MIT
├── install.ps1 / install.sh  # installer satu perintah (Windows / macOS-Linux)
├── package.json
├── config/presets.json       # preset rasio/ukuran (bisa ditambah sendiri)
├── references/
│   ├── manual.md             # panduan manual tanpa AI, opsi lengkap, rasio, zoom
│   └── flow-schema.md        # referensi lengkap format flow
├── scripts/
│   ├── run.mjs               # satu perintah: capture → video → dokumen (multi-rasio)
│   ├── capture.mjs           # deteksi URL, jalankan flow, blur/hide, screenshot, rekam video
│   ├── make-video.mjs        # zoom, subtitle, logo, musik, efek klik, voice-over, thumbnail, chapter, klip
│   ├── make-music.mjs        # pembuat musik latar (lofi / corporate)
│   └── build-docs.mjs        # DOKUMENTASI.docx + DOKUMENTASI.html
└── examples/
    ├── flow.example.json     # contoh flow lengkap
    ├── .env.example          # contoh kredensial
    └── demo-app/index.html   # aplikasi contoh untuk uji coba
```

## Lisensi

[MIT](LICENSE) © lasandry. Bebas dipakai, diubah, dan dibagikan, termasuk untuk keperluan komersial, asal mencantumkan nama pembuat.
