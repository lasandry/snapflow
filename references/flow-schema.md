# Skema Flow JSON

```jsonc
{
  "name": "Nama Aplikasi",                 // judul dokumen & kartu intro
  "description": "Ringkasan panduan",
  // "baseUrl" opsional: bila dihapus, dideteksi otomatis dari folder aplikasi
  // (APP_URL di .env, http://<folder>.test, lalu port 8000/3000/5173/8080/4200)
  "baseUrl": "http://localhost:8000/",     // path relatif di steps diselesaikan terhadap ini
  "lang": "id",                            // id | en (label dokumen)
  "locale": "id-ID", "timezone": "Asia/Jakarta", "colorScheme": "light",

  "format": {                              // ukuran & rasio (bisa ditimpa --ratio/--preset)
    "preset": "youtube",                   // lihat config/presets.json
    "ratio": "16:9",                       // bebas: 9:16, 1:1, 4:5, 21:9, 3:4 ...
    "viewportWidth": 1280,                 // lebar layout CSS (390 ≈ HP, 1280 ≈ laptop)
    "outputWidth": 1920,                   // lebar piksel screenshot & video
    "mobile": false,                       // emulasi sentuh/HP (default: true bila portrait)
    "device": "iPhone 13",                 // opsional: profil perangkat Playwright
    "fps": 30
  },

  "mode": "demo",                          // demo | test
  "video": true,                           // false = hanya screenshot
  "videoQuality": 92,                      // kualitas JPEG frame rekaman (1-100)
  "captions": true,                        // caption di halaman (run.mjs mematikannya; aktifkan dengan --page-captions)
  "cleanScreenshots": true,                // screenshot tanpa kursor/caption
  "mask": ["td.email", "[name=nik]"],      // blur data pribadi di video & screenshot
  "hide": [".chat-widget", ".promo"],      // sembunyikan elemen pengganggu (selain bawaan)
  "hideDefaults": true,                    // false = jangan sembunyikan debugbar/overlay dev/banner cookie bawaan
  "brand": { "logo": "logo.png", "color": "#2457F5" }, // logo (relatif ke file flow) & warna utama
  "version": "2.1.0",                      // ditampilkan di sampul dokumen Word
  "thumbnail": 3,                          // nomor langkah yang screenshot-nya dipakai untuk thumbnail (default: langkah 2)
  "fullPage": false,                       // screenshot seluruh halaman (scroll penuh)
  "timeout": 15000,                        // batas tunggu tiap aksi (ms)
  "stopOnFail": false,                     // mode test: berhenti di langkah gagal pertama
  "storageState": "auth.json",             // pakai sesi login tersimpan
  "httpCredentials": { "username": "${env:BASIC_USER}", "password": "${env:BASIC_PASS}" },
  "ignoreHTTPSErrors": false,

  "zoom": { "enabled": true, "level": 1.8, "actions": ["click","fill","select","check","upload","focus"],
            "rampIn": 0.45, "rampOut": 0.6, "pan": 0.5, "hold": 0.5 },
  "timing": { "typeDelay": 55, "moveSteps": 22, "pauseAfterAction": 700, "pauseAfterStep": 1400 },

  "steps": [ /* lihat di bawah */ ],
  "pages": [ { "path": "/laporan", "title": "Laporan", "description": "..." } ],   // pintasan: 1 halaman = 1 langkah
  "crawl": { "start": "/", "maxPages": 30, "exclude": ["/admin/hapus"] }       // atau --crawl
}
```

## Langkah (step)

```jsonc
{
  "title": "Tambah Barang",                // judul bagian dokumen & subtitle
  "description": "Klik tombol ...",         // paragraf penjelasan di dokumen
  "narration": "Sekarang klik ...",         // naskah voice-over & subtitle (default = description)
  "url": "/barang/create",                  // opsional: buka halaman dulu
  "caption": "Teks caption di halaman",     // default = title
  "actions": [ /* aksi */ ],
  "screenshot": true,                       // false = lewati screenshot
  "highlight": "#form-barang",              // opsional, hanya bila user minta: bingkai merah di screenshot (bawaan: tanpa)
  "element": ".card",                       // screenshot elemen saja (bukan layar penuh)
  "fullPage": true,
  "zoom": false                             // matikan zoom untuk semua aksi langkah ini
}
```

## Aksi

| Aksi | Contoh | Keterangan |
|---|---|---|
| `goto` | `{ "goto": "/login" }` | Buka URL |
| `click` / `dblclick` | `{ "click": "role=button[name=\"Simpan\"]" }` | Kursor bergerak lalu klik |
| `hover` | `{ "hover": "#menu" }` | |
| `fill` | `{ "fill": "[name=email]", "value": "${env:EMAIL}" }` | Mode demo: diketik huruf per huruf |
| `type` | `{ "type": "#cari", "value": "laptop" }` | Ketik tanpa mengosongkan field |
| `press` | `{ "press": "#cari", "value": "Enter" }` | `"press": "page"` untuk tombol global |
| `select` | `{ "select": "#kategori", "value": "ATK" }` | |
| `check` / `uncheck` | `{ "check": "#setuju" }` | |
| `upload` | `{ "upload": "input[type=file]", "value": "contoh.pdf" }` | Path relatif terhadap file flow |
| `scroll` | `{ "scroll": 600 }` atau `{ "scroll": "#tabel" }` | |
| `focus` | `{ "focus": ".total", "duration": 2000, "caption": "Total otomatis" }` | Sorot + zoom tanpa klik |
| `wait` | `{ "wait": 1000 }` | ms |
| `waitFor` | `{ "waitFor": ".toast" }` | Tunggu elemen terlihat |
| `waitForUrl` | `{ "waitForUrl": "dashboard" }` | Regex URL |
| `expectText` | `{ "expectText": "Berhasil disimpan" }` | Verifikasi (gagal → dicatat) |
| `expectUrl` / `expectVisible` | `{ "expectUrl": "/barang$" }` | |
| `eval` | `{ "eval": "localStorage.clear()" }` | JavaScript di halaman |
| `saveSession` | `{ "saveSession": "auth.json" }` | Simpan cookie/login untuk run berikutnya |

Properti tambahan di setiap aksi: `caption` (teks sorotan di atas video), `zoom` (`false` / angka), `nth` (pilih elemen ke-n), `options` (opsi Playwright untuk click).

## Selector

Selector Playwright: CSS (`#id`, `.class`, `[name=x]`), `text=Simpan`, `role=button[name="Simpan"]`, `xpath=//...`. Pilih selector yang stabil: id, name, atau teks tombol.
