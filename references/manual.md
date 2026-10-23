# Snapflow — Panduan Manual (tanpa AI)

Panduan ini untuk menjalankan Snapflow sendiri tanpa AI, atau untuk mengatur hasilnya lebih detail. Kalau memakai AI, semua langkah ini dikerjakan otomatis (lihat [README](../README.md)).

Semua perintah dijalankan dari **folder aplikasi Anda**. Contoh di bawah memakai lokasi skill default `~/.claude/skills/snapflow`; sesuaikan bila berbeda.

## Daftar isi

1. [Tulis flow](#1-tulis-flow)
2. [Jalankan](#2-jalankan)
3. [Opsi](#3-opsi)
4. [Voice-over](#4-voice-over)
5. [Mengatur rasio & ukuran](#5-mengatur-rasio--ukuran)
6. [Auto-zoom mengikuti kursor](#6-auto-zoom-mengikuti-kursor)
7. [Demo vs Test](#7-demo-vs-test)
8. [Tips](#8-tips)

---

## 1. Tulis flow

Buat folder `snapflow/` di root aplikasi, lalu salin contoh flow:

```bash
mkdir snapflow
cp ~/.claude/skills/snapflow/examples/flow.example.json snapflow/flow.json
```

Edit `snapflow/flow.json` sesuai aplikasi Anda. Format lengkap ada di [flow-schema.md](flow-schema.md).

```json
{
  "name": "Aplikasi Saya",
  "description": "Panduan menambah data baru",
  "format": { "preset": "youtube" },
  "steps": [
    { "title": "Login", "url": "/login",
      "description": "Masukkan email dan password akun Anda.",
      "narration": "Pertama, masuk dengan email dan password akun Anda.",
      "actions": [
        { "fill": "[name=email]", "value": "${env:APP_EMAIL}" },
        { "fill": "[name=password]", "value": "${env:APP_PASSWORD}" },
        { "click": "role=button[name=\"Login\"]" },
        { "waitForUrl": "dashboard" }
      ] },
    { "title": "Dashboard", "description": "Ringkasan data aplikasi.",
      "actions": [ { "focus": ".card-total" } ] },
    { "title": "Tambah Data", "url": "/data/create" }
  ]
}
```

- `baseUrl` tidak perlu ditulis. Alamat aplikasi dideteksi otomatis: `APP_URL` di `.env`, `http://<nama-folder>.test` (Herd/Valet), lalu port 8000, 3000, 5173, 8080, 4200. Pastikan server dev aplikasi sudah berjalan.
- `description` → paragraf di dokumen Word/HTML.
- `narration` → kalimat voice-over dan subtitle. Bila kosong, yang dipakai `description`.

Simpan akun login di `snapflow/.env`:

```
APP_EMAIL=admin@contoh.id
APP_PASSWORD=password
```

Bila memakai git, tambahkan ke `.gitignore` aplikasi:

```
snapflow/*/
snapflow/.env
```

## 2. Jalankan

```bash
# Tutorial lengkap: 16:9 + 9:16, subtitle, musik, efek klik
node ~/.claude/skills/snapflow/scripts/run.mjs --flow snapflow/flow.json --out snapflow --ratios 16:9,9:16 --burn-subs --music --sfx

# Video clean (tanpa teks), musik gaya corporate
node ~/.claude/skills/snapflow/scripts/run.mjs --flow snapflow/flow.json --out snapflow --presets youtube,reels --music corporate --sfx

# Uji coba (cepat + laporan lulus/gagal)
node ~/.claude/skills/snapflow/scripts/run.mjs --flow snapflow/flow.json --out snapflow --mode test

# Hanya screenshot semua halaman (crawl link internal)
node ~/.claude/skills/snapflow/scripts/run.mjs --flow snapflow/flow.json --out snapflow --crawl --no-video
```

Hasilnya ada di `snapflow/<tanggal_jam>/<youtube|tiktok|...>/`.

## 3. Opsi

| Opsi | Fungsi |
|---|---|
| `--ratios 16:9,9:16` / `--presets youtube,reels` | Rasio atau preset (lihat `config/presets.json`) |
| `--mode demo` / `--mode test` | demo = video tutorial; test = cepat + laporan |
| `--burn-subs` | Tanam subtitle gaya Netflix. Tanpa opsi ini video bersih (subtitle tetap ada sebagai `.srt`) |
| `--music` / `--music corporate` / `--music lagu.mp3` | Musik latar dibuat otomatis sepanjang video (default `lofi`), atau file sendiri |
| `--sfx` | Bunyi klik mouse di setiap klik |
| `--clips` | Klip pendek per fitur di `clips-<rasio>/` (untuk Reels/TikTok) |
| `--logo file.png` / `--brand-color #hex` | Logo dan warna brand (menimpa `brand` di flow) |
| `--voiceover <folder>` | Gabungkan narasi `00.mp3`, `01.mp3`, … (lihat bagian 4) |
| `--intro "Judul"` / `--no-intro` / `--outro "Teks"` | Kartu pembuka/penutup |
| `--speed 1.2` | Percepat video |
| `--gif` | Buat preview GIF |
| `--embed` | HTML satu file (gambar di dalamnya) |
| `--out <folder>` | Lokasi hasil (default `output/`) |
| `--headed` | Tampilkan browser (debug / login manual) |

## 4. Voice-over

1. Render sekali seperti biasa.
2. Buka `voiceover-16x9.txt` di folder hasil. Setiap bagian sudah diberi nama file:
   ```
   [00:02 – 00:06] Login  → 01.mp3
   Pertama, masuk dengan email dan password akun Anda.
   ```
3. Buat audionya dengan TTS AI (ElevenLabs, dll) atau rekam sendiri, lalu simpan ke satu folder: `vo/00.mp3`, `vo/01.mp3`, …
4. Render ulang video saja, tanpa merekam browser lagi:
   ```bash
   node ~/.claude/skills/snapflow/scripts/make-video.mjs snapflow/2026-10-24_1430/youtube --voiceover vo/ --burn-subs --music --sfx
   ```

Narasi diletakkan tepat di awal langkahnya, dan musik otomatis mengecil saat narasi berbicara. Folder `vo/` yang sama bisa dipakai untuk rasio 9:16.

## 5. Mengatur rasio & ukuran

Ada tiga angka yang menentukan hasil:

- **ratio**: bentuk gambar/video (`16:9`, `9:16`, `1:1`, …)
- **viewportWidth**: lebar layout yang "dilihat" aplikasi (CSS px). `390` = tampilan HP, `1280` = laptop. Angka ini menentukan apakah aplikasi tampil versi mobile atau desktop.
- **outputWidth**: lebar piksel file akhir (`1080`, `1920`, `3840`). Diperoleh lewat deviceScaleFactor, jadi hasil tetap tajam.

```bash
node ~/.claude/skills/snapflow/scripts/capture.mjs --flow snapflow/flow.json --ratio 9:16 --viewport 390 --width 1080   # layout HP, 1080×1920
node ~/.claude/skills/snapflow/scripts/capture.mjs --flow snapflow/flow.json --ratio 9:16 --viewport 720 --width 1080   # layout tablet portrait
node ~/.claude/skills/snapflow/scripts/capture.mjs --flow snapflow/flow.json --ratio 16:9 --viewport 1440 --width 3840  # 4K
```

Untuk mengubah video yang sudah jadi ke rasio lain tanpa merekam ulang (latar blur):

```bash
node ~/.claude/skills/snapflow/scripts/make-video.mjs snapflow/2026-10-24_1430/youtube --ratio 9:16 --name versi-reels
```

Hasil terbaik tetap didapat dengan merekam ulang di rasio target, karena layout aplikasi ikut menyesuaikan.

Tambah preset sendiri di `config/presets.json`:

```json
"wa-status": { "ratio": "9:16", "viewportWidth": 390, "outputWidth": 720, "mobile": true }
```

## 6. Auto-zoom mengikuti kursor

Dalam mode demo, setiap klik, isi form, pilih dropdown, centang, upload, dan `focus` otomatis di-zoom:

- kamera zoom halus ke elemen yang sedang dipakai (input lebar di-zoom lebih sedikit agar tetap terlihat utuh),
- saat mengisi beberapa field berturut-turut, kamera bergeser dari field ke field tanpa zoom-out,
- kamera zoom-out saat pindah langkah, atau segera setelah klik yang membuka halaman/tampilan baru.

Pengaturan di flow:

```jsonc
"zoom": { "enabled": true, "level": 1.8, "actions": ["click", "fill", "select", "focus"] }
{ "click": "#menu", "zoom": false }          // aksi ini tidak di-zoom
{ "focus": "#grafik", "zoom": 2.5 }          // paksa zoom 2.5x
{ "title": "Ringkasan", "zoom": false, ... } // seluruh langkah tanpa zoom
```

Saat render:

```bash
node ~/.claude/skills/snapflow/scripts/make-video.mjs <folder-hasil> --no-zoom          # matikan
node ~/.claude/skills/snapflow/scripts/make-video.mjs <folder-hasil> --zoom-level 1.5   # zoom lebih lembut
```

## 7. Demo vs Test

| | `--mode demo` | `--mode test` |
|---|---|---|
| Kecepatan | natural (ketik per huruf, jeda) | secepat mungkin |
| Kursor, efek klik, caption, zoom | Ya | Tidak |
| Verifikasi `expect*` | Ya | Ya |
| Langkah gagal | dicatat, lanjut | dicatat + screenshot error; berhenti bila `stopOnFail` |
| Output | video tutorial + dokumen | video bukti + dokumen berisi tabel hasil uji |
| Exit code | 0 | 2 bila ada yang gagal (cocok untuk CI) |

## 8. Tips

- **Data pribadi**: tambahkan selector ke `"mask"` di flow, mis. `"mask": ["td.email", "[name=nik]"]`. Bagian itu di-blur di video dan screenshot.
- **Gangguan saat develop**: Laravel Debugbar, overlay Vite/Next/Nuxt, dan banner cookie umum disembunyikan otomatis. Tambah elemen lain lewat `"hide": [".chat-widget"]`.
- **Logo & warna**: `"brand": { "logo": "logo.png", "color": "#2457F5" }` dipakai di kartu pembuka/penutup, watermark video, thumbnail, dan sampul Word.
- **Versi bahasa lain**: salin flow menjadi `flow.en.json`, terjemahkan teksnya, set `"lang": "en"`.
- **Login dengan OTP/CAPTCHA**: jalankan sekali dengan `--headed` dan set `"timeout": 120000`, login manual, pakai `{ "waitForUrl": "dashboard" }` lalu `{ "saveSession": "auth.json" }`. Run berikutnya cukup memakai `"storageState": "auth.json"`.
- **Data contoh**: gunakan database staging/seeder agar screenshot rapi dan tidak membocorkan data asli.
- **Selector stabil**: tambahkan `id` atau `data-testid` di view (Blade/Flutter Web) untuk elemen penting.
- **Flutter Web**: aktifkan semantics (`SemanticsBinding.instance.ensureSemantics()`) agar elemen bisa dipilih dengan `role=`/`text=`.
- **Cetak PDF**: buka `DOKUMENTASI.html` → Print → Save as PDF.
- **Hindari aksi destruktif** (hapus, bayar, broadcast) di produksi.
