# AGENTS.md — Snapflow

Instruksi untuk agent coding apa pun (OpenAI Codex, Gemini CLI, Cursor, Windsurf, Aider, Cline, dan lainnya). Isinya sama dengan `SKILL.md`; file ini ada karena banyak agent otomatis membaca `AGENTS.md`.

**Baca `SKILL.md` untuk alur kerja lengkap, dan `references/flow-schema.md` untuk format flow.**

Ringkas:

1. Setup hanya bila belum (`node_modules` belum ada atau `ffmpeg` tidak ditemukan): jalankan `install.ps1` (Windows) atau `install.sh` (macOS/Linux) dengan `SNAPFLOW_DIR=<folder-skill>`. Komponen yang sudah ada dilewati.
2. Tulis `flows/<app>.json` dengan menyalin `examples/flow.example.json`. Kredensial ditulis sebagai `${env:NAMA}` dan nilainya disimpan di `.env`.
2b. Akun login: cari sendiri di `.env`, seeder, factory, README, atau tes aplikasi; tanya user hanya bila tidak ketemu. Lihat `SKILL.md`.
3. Jalankan: `node scripts/run.mjs --flow flows/<app>.json --ratios 16:9,9:16 --burn-subs`
   (atau `--mode test` untuk uji coba, `--crawl --no-video` untuk screenshot semua halaman).
4. Verifikasi hasil di `snapflow/<tanggal_jam>/<preset atau rasio>/` (folder baru tiap run; bahan mentah di `raw/`): lihat screenshot dan beberapa frame video, lalu cek `manifest.json` → `summary`.
5. Laporkan ke user: file yang dihasilkan, rasio, durasi, dan langkah yang gagal (jika ada).

Aturan:

- Jangan menjalankan flow yang menghapus, membayar, atau mengirim data di produksi tanpa izin user. Gunakan staging atau data uji.
- Jangan menulis password di file flow atau di laporan.
- Jika selector gagal, baca HTML halaman (atau kode view/Blade/komponen) untuk mencari selector yang benar, perbaiki flow, lalu jalankan ulang.
