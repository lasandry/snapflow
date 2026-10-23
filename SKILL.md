---
name: snapflow
description: Buat dokumentasi aplikasi web otomatis — screenshot setiap halaman/langkah, video tutorial (demo) atau video uji coba (test) dengan auto-zoom mengikuti kursor, subtitle, dan rasio yang bisa diatur (16:9, 9:16, 1:1, 4:5, dll). Pakai saat user minta dokumentasi aplikasi, panduan pengguna bergambar, screenshot semua halaman, video tutorial/demo aplikasi, video untuk Reels/TikTok/Shorts/YouTube, atau rekaman pengujian alur aplikasi. Use for app documentation, user guides with screenshots, product demo videos, tutorial videos, or recorded E2E test runs.
---

# Snapflow

Mengubah **satu file flow JSON** menjadi:

- `screenshots/*.png` — satu gambar bersih per halaman/langkah (tanpa kursor, caption, atau kotak penanda)
- `tutorial-<rasio>.mp4` — video tutorial dengan kursor terlihat, efek klik, **auto-zoom mengikuti kursor** saat klik/isi form, kartu judul, subtitle, penanda "Langkah 2/6", logo brand
- `tutorial-<rasio>.srt/.vtt` — subtitle terpisah (gaya Netflix: maks 2 baris per tampilan)
- `voiceover-<rasio>.txt` — naskah voice-over per langkah dengan timestamp; `voiceover-teks.txt` — teks saja, siap ditempel ke TTS AI
- `chapters-<rasio>.txt` — chapter YouTube siap tempel ke deskripsi; `thumbnail-<rasio>.jpg` — sampul video; `clips-<rasio>/` — klip pendek per fitur (`--clips`)
- `DOKUMENTASI.docx` (Word, dengan sampul + daftar isi) + `DOKUMENTASI.html` — panduan siap edit/cetak/kirim. URL aplikasi (localhost/staging) tidak dicantumkan di output
- `manifest.json` — data mentah (waktu langkah, status, event zoom)

Semua skrip berada di `scripts/` dan hanya butuh **Node 18+, Playwright (Chromium), dan ffmpeg**. Skill ini tidak bergantung pada AI tertentu.

## Alur kerja agent

Skill ini dijalankan **di folder aplikasi user** (root project). Semua perintah dijalankan dari folder itu, dan skrip dipanggil dengan path folder skill: `node <folder-skill>/scripts/run.mjs ...`.

1. **Pahami aplikasinya dari kode, jangan minta URL ke user.** Cari sendiri halaman/fitur yang perlu didokumentasikan (routes, menu, controller, komponen), cara login, tujuan (demo / uji coba), dan rasio output.
   **URL aplikasi:** jangan tanya user dan jangan tulis `baseUrl` di flow. Snapflow mendeteksi sendiri aplikasi yang sedang berjalan (`APP_URL` di `.env`, `http://<nama-folder>.test` untuk Herd/Valet, lalu port 8000, 3000, 5173, 8080, 4200). Bila muncul error "Aplikasi tidak ditemukan berjalan", nyalakan server dev-nya di background sesuai jenis project (`php artisan serve`, `npm run dev`, `python manage.py runserver`, `flutter run -d web-server`), tunggu sampai siap, jalankan ulang, lalu matikan server itu setelah selesai.
   Jika user tidak menyebut rasio: dokumentasi → `16:9`; konten media sosial → `9:16`.
   **Konfirmasi gaya video sebelum render:**
   - *clean* (tanpa teks apa pun; subtitle tetap tersedia sebagai `.srt`) atau *dengan subtitle* tertanam (`--burn-subs`)?
   - musik latar dan efek klik (`--music --sfx`)? Default: ya. Musik dibuat otomatis saat render, sepanjang video; pilih gayanya sesuai isi: `--music lofi` (tutorial/dokumentasi, default) atau `--music corporate` (demo produk, promo, Reels).
   - untuk konten media sosial (Reels/TikTok/Shorts), tambahkan `--clips` agar tiap fitur juga jadi klip pendek.
   Screenshot, dokumen Word (sampul + daftar isi), thumbnail, chapter YouTube, dan naskah voice-over selalu dibuat.
2. **Siapkan lingkungan** hanya bila belum: jika `<folder-skill>/node_modules` sudah ada dan `ffmpeg -version` berhasil, lewati langkah ini. Jika belum, jalankan installer (komponen yang sudah ada dilewati):
   ```bash
   powershell -ExecutionPolicy Bypass -File <folder-skill>/install.ps1   # Windows
   bash <folder-skill>/install.sh                                       # macOS / Linux
   ```
   Set `SNAPFLOW_DIR=<folder-skill>` agar installer memakai folder yang sudah ada.
3. **Tulis flow** di `snapflow/flow.json` (di folder aplikasi). Salin dari `<folder-skill>/examples/flow.example.json` dan hapus `baseUrl`. Skema lengkap ada di `references/flow-schema.md`.
   - Selector: utamakan `#id`, `[name=...]`, `role=button[name="Simpan"]`, atau `text=Simpan`. Untuk Laravel/Blade, pakai atribut `name` pada input.
   - **Kredensial jangan ditulis di flow.** Pakai `"${env:NAMA}"` dan simpan nilainya di `snapflow/.env` (`.env` aplikasi juga ikut terbaca).
   - **Akun login: cari sendiri dulu, jangan langsung bertanya.** Urutan pencarian di kode aplikasi:
     1. `.env` yang sudah ada (mis. `DEMO_EMAIL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`)
     2. seeder: Laravel `database/seeders/*.php` (cari `email`, `password`, `Hash::make('...')`, `bcrypt('...')`); Node/Prisma `prisma/seed.*`, `seeders/`; Django fixtures
     3. factory: password default Laravel `UserFactory` biasanya `password`
     4. README, `docker-compose.yml`, tes (`tests/`) yang login dengan akun tertentu
     Pilih akun dengan peran yang paling sesuai untuk fitur yang direkam (mis. admin untuk menu master data). Coba login sekali dalam `--mode test`. Bila gagal atau tidak ditemukan, baru tanyakan ke user.
     Jangan reset password atau mengubah data user di database. Di aplikasi produksi, selalu tanyakan dulu.
   - Tulis `narration` di tiap langkah: kalimat yang akan diucapkan voice-over dan tampil sebagai subtitle (default: `description`). Kalimat pendek, ±2,5 kata per detik durasi langkah.
   - **Data pribadi:** cek tabel/form yang direkam. Bila ada email, NIK, nomor HP, alamat, atau nama orang sungguhan, tambahkan selectornya ke `"mask"` (di-blur di video dan screenshot).
   - **Gangguan dev:** Laravel Debugbar, overlay Vite/Next, dan banner cookie umum sudah disembunyikan otomatis. Elemen lain yang mengganggu (banner promo, chat widget, notifikasi) tambahkan ke `"hide"`.
   - **Brand:** cari logo aplikasi (`public/logo.png`, `public/images/logo*`, `resources/`, favicon PNG besar) dan warna utama (tailwind config, CSS variable `--primary`, warna navbar). Isi `"brand": { "logo": "<path relatif ke flow>", "color": "#hex" }`. Logo PNG transparan paling bagus. Isi `"version"` dari `composer.json`/`package.json` bila ada.
   - Tambahkan `{ "focus": "<selector>", "caption": "..." }` untuk menyorot dan zoom area penting tanpa klik (grafik, total, notifikasi).
   - Hindari aksi destruktif di aplikasi produksi (hapus, bayar, kirim massal). Gunakan staging atau data uji.
4. **Jalankan dari folder aplikasi** (lihat Perintah di bawah). Mulai dengan satu rasio, periksa hasilnya, baru render rasio lain.
5. **Periksa hasil** sebelum menyerahkan:
   - buka 2–3 screenshot,
   - ambil beberapa frame video: `ffmpeg -ss 5 -i tutorial-16x9.mp4 -frames:v 1 cek.png`,
   - pastikan `manifest.json` → `summary.failed == 0` (mode test).
   Jika selector gagal, perbaiki flow dan jalankan ulang. Jangan menebak hasil.
6. **Serahkan** folder output (atau zip), plus ringkasan: jumlah langkah, rasio, durasi video, langkah yang gagal.

**Versi bahasa lain** (mis. user minta versi Inggris): salin `snapflow/flow.json` menjadi `snapflow/flow.en.json`, terjemahkan `name`, `description`, serta `title`/`description`/`narration`/`caption` tiap langkah, set `"lang": "en"` dan tambahkan akhiran pada nama (mis. `"Inventory App (EN)"`) agar foldernya terpisah. Jalankan dengan flow tersebut. Label video ("Step 2/6") dan dokumen ikut berbahasa Inggris.

### Lokasi hasil

Setiap kali `run.mjs` dijalankan, hasilnya masuk ke **folder baru bertanggal**, jadi hasil lama tidak tertimpa:

```
<out>/<nama-app>/<YYYY-MM-DD_HHmm>/demo-16x9/
                                  /demo-9x16/
```

Di folder aplikasi, susunannya:

```
<root-aplikasi>/
└── snapflow/
    ├── flow.json      # skenario rekaman (boleh di-commit)
    ├── .env           # akun login (jangan di-commit)
    └── output/        # hasil (jangan di-commit)
```

Tambahkan `snapflow/output/` dan `snapflow/.env` ke `.gitignore` aplikasi bila memakai git.

## Perintah

```bash
# Semua sekaligus (capture → video → dokumen), dua rasio
node <folder-skill>/scripts/run.mjs --flow snapflow/flow.json --out snapflow/output --ratios 16:9,9:16 --burn-subs --music --sfx   # subtitle + musik + efek klik
node <folder-skill>/scripts/run.mjs --flow snapflow/flow.json --out snapflow/output --ratios 16:9,9:16               # clean

# Pakai preset (youtube, desktop, laptop, docs, square, feed, reels, tiktok, shorts, tablet, playstore)
node <folder-skill>/scripts/run.mjs --flow snapflow/flow.json --out snapflow/output --presets youtube,reels

# Mode uji coba/percobaan: cepat, tanpa efek, laporan lulus/gagal, exit code 2 bila ada yang gagal
node <folder-skill>/scripts/run.mjs --flow snapflow/flow.json --out snapflow/output --mode test

# Screenshot semua halaman otomatis (crawl link internal, logout/hapus dilewati)
node <folder-skill>/scripts/run.mjs --flow snapflow/flow.json --out snapflow/output --crawl --no-video

# Langkah terpisah
node <folder-skill>/scripts/capture.mjs   --flow snapflow/flow.json --out snapflow/output --ratio 4:5 --width 1080 --viewport 430
node <folder-skill>/scripts/make-video.mjs snapflow/output/<app>/<tanggal_jam>/demo-4x5 --speed 1.2 --intro "Cara Input Barang" --outro "Terima kasih" --burn-subs --gif
node <folder-skill>/scripts/make-video.mjs snapflow/output/<app>/<tanggal_jam>/demo-16x9 --ratio 9:16 --name versi-reels   # bingkai ulang dari 16:9 (latar blur)
node <folder-skill>/scripts/build-docs.mjs snapflow/output/<app>/<tanggal_jam>/demo-16x9 --embed --title "Panduan Pengguna"
```

### Opsi penting

| Opsi | Untuk | Keterangan |
|---|---|---|
| `--ratio 9:16` / `--preset reels` | capture, run | Rasio bebas `W:H`. Viewport CSS + deviceScaleFactor dihitung otomatis supaya tajam |
| `--width 1080` / `--viewport 390` | capture | Lebar piksel output / lebar layout CSS (390 = layout HP, 1280 = desktop) |
| `--mode demo\|test` | capture, run | demo = lambat, kursor, ripple klik, zoom. test = cepat, laporan |
| `--burn-subs` | make-video, run | Tanam subtitle gaya Netflix (naskah narasi, caption aksi di atas). Tanpa opsi ini video bersih |
| `--no-zoom`, `--zoom-level 2`, `--zoom-ramp 0.5` | make-video, run | Kontrol auto-zoom |
| `--clips` | make-video, run | Potong video jadi klip pendek per fitur (mengikuti chapter) di `clips-<rasio>/` untuk Reels/TikTok |
| `--logo file.png`, `--brand-color #hex` | make-video, run | Menimpa `brand` di flow |
| `--voiceover <folder>` | make-video, run | Narasi per langkah: `00.mp3` = pembuka, `01.mp3` = langkah 1, dst. (nama boleh `01-login.mp3`). Diletakkan tepat di awal langkahnya; musik otomatis mengecil saat narasi. Ada peringatan bila audio lebih panjang dari langkahnya |
| `--music [lofi\|corporate\|file]`, `--sfx` | make-video, run | Musik latar instrumental dibuat otomatis (sintesis, bebas royalti) sepanjang video, fade in/out, mengecil saat voice-over. Bisa juga file musik sendiri. `--sfx`: bunyi "tik" lembut di setiap klik |
| `--speed`, `--intro`, `--outro`, `--gif` | make-video, run | Pasca-produksi |
| `--embed` | build-docs, run | HTML satu file (gambar di-embed) |
| `--headed` | capture | Tampilkan browser (debug) |

## Auto-zoom

Setiap aksi `click`, `fill`, `select`, `check`, `upload`, `focus` dicatat (posisi + waktu). `make-video` lalu:

- zoom masuk halus ke elemen tersebut; tingkat zoom menyesuaikan ukuran elemen (input lebar di-zoom lebih sedikit),
- pan dari field ke field selama masih dalam satu langkah, tanpa zoom-out di tengah,
- zoom keluar saat pindah langkah, atau segera setelah klik yang mengganti tampilan/halaman.

Atur di flow: `"zoom": { "level": 1.8, "actions": ["click","fill"] }`. Per aksi atau per langkah: `"zoom": false`, atau `"zoom": 2.2` untuk memaksa tingkat zoom.

## Batasan

- Hanya aplikasi **web** (termasuk Flutter Web dan PWA). Aplikasi Android native butuh emulator dan screen recorder, di luar cakupan skrip ini.
- Login dengan CAPTCHA/OTP: login manual sekali dengan `--headed`, simpan sesi (`{ "saveSession": "auth.json" }`), lalu pakai `"storageState": "auth.json"`.
- Voice-over tidak dibuat otomatis. Alurnya: render sekali → buat audio tiap bagian dari `voiceover-<rasio>.txt` (TTS AI atau rekam sendiri, nama file sesuai tanda `→ 01.mp3`) → render ulang video saja: `node <folder-skill>/scripts/make-video.mjs <folder-hasil> --voiceover vo/ --burn-subs --music --sfx` (tanpa merekam ulang browser). Folder voice-over yang sama bisa dipakai untuk semua rasio.
