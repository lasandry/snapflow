#!/usr/bin/env bash
# Snapflow — pasang/update sekali jalan (macOS / Linux):
#   curl -fsSL https://raw.githubusercontent.com/lasandry/snapflow/main/install.sh | bash
# Lokasi default: ~/.claude/skills/snapflow  (ganti dengan SNAPFLOW_DIR=... sebelum bash)
# Komponen yang sudah terpasang dilewati. Jalankan lagi perintah yang sama untuk update.
set -euo pipefail
REPO="https://github.com/lasandry/snapflow"
DIR="${SNAPFLOW_DIR:-$HOME/.claude/skills/snapflow}"

need() { # need <perintah> <paket-brew> <paket-apt> <nama>
  if command -v "$1" >/dev/null; then echo "[ok] $4 sudah terpasang"; return; fi
  echo "[..] Memasang $4..."
  if command -v brew >/dev/null; then brew install "$2"
  elif command -v apt-get >/dev/null; then sudo apt-get update -qq && sudo apt-get install -y "$3"
  else echo "$4 belum terpasang. Pasang manual lalu jalankan ulang." >&2; exit 1; fi
}

# 1. Kebutuhan sistem (dilewati bila sudah ada)
need node node nodejs "Node.js"
command -v npm >/dev/null || need npm node npm "npm"
need ffmpeg ffmpeg ffmpeg "ffmpeg"

# 2. Ambil/update kode skill: git pull bila dipasang lewat git, clone bila baru, selain itu unduh tarball terbaru (timpa)
if [ -d "$DIR/.git" ]; then
  echo "[..] Update skill (git)..."; git -C "$DIR" pull --ff-only
elif [ ! -f "$DIR/SKILL.md" ] && command -v git >/dev/null; then
  git clone --depth 1 "$REPO.git" "$DIR"
else
  echo "[..] Mengunduh versi terbaru..."
  mkdir -p "$DIR"
  curl -fsSL "$REPO/archive/refs/heads/main.tar.gz" | tar -xz -C "$DIR" --strip-components=1
fi

# 3. Paket npm + Chromium (npm & Playwright melewati yang sudah terpasang)
cd "$DIR"
npm install --no-audit --no-fund
# Linux: library sistem untuk Chromium (butuh sudo; dilewati bila gagal)
if [ "$(uname)" = "Linux" ]; then npx playwright install-deps chromium || echo "Lewati install-deps (jalankan manual dengan sudo bila Chromium gagal)."; fi

echo
echo "Snapflow siap di $DIR"
echo 'Coba di AI: "Pakai skill snapflow. Buat video tutorial aplikasi saya di http://localhost:8000"'
