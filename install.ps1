# Snapflow — pasang/update sekali jalan (Windows PowerShell):
#   irm https://raw.githubusercontent.com/lasandry/snapflow/main/install.ps1 | iex
# Lokasi default: ~/.claude/skills/snapflow  (ganti dengan $env:SNAPFLOW_DIR sebelum menjalankan)
# Komponen yang sudah terpasang dilewati. Jalankan lagi perintah yang sama untuk update.
$ErrorActionPreference = 'Stop'
$Repo = 'https://github.com/lasandry/snapflow'
$Dir = if ($env:SNAPFLOW_DIR) { $env:SNAPFLOW_DIR } else { Join-Path $HOME '.claude\skills\snapflow' }

function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function RefreshPath { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Need($cmd, $wingetId, $label) {
  if (Has $cmd) { Write-Host "[ok] $label sudah terpasang"; return }
  if (-not (Has 'winget')) { throw "$label belum terpasang dan winget tidak tersedia. Pasang manual lalu jalankan ulang." }
  Write-Host "[..] Memasang $label..."
  winget install -e --id $wingetId --accept-source-agreements --accept-package-agreements
  RefreshPath
  if (-not (Has $cmd)) { throw "$label terpasang tapi belum terbaca. Tutup PowerShell, buka lagi, lalu jalankan ulang." }
}

# 1. Kebutuhan sistem (dilewati bila sudah ada)
Need 'node' 'OpenJS.NodeJS.LTS' 'Node.js'
Need 'ffmpeg' 'Gyan.FFmpeg' 'ffmpeg'

# 2. Ambil/update kode skill: git pull bila dipasang lewat git, clone bila baru, selain itu unduh zip terbaru (timpa)
if (Test-Path (Join-Path $Dir '.git')) {
  Write-Host '[..] Update skill (git)...'; git -C $Dir pull --ff-only
} elseif (-not (Test-Path (Join-Path $Dir 'SKILL.md')) -and (Has 'git')) {
  git clone --depth 1 "$Repo.git" $Dir
} else {
  Write-Host '[..] Mengunduh versi terbaru...'
  $zip = Join-Path $env:TEMP 'snapflow.zip'; $tmp = Join-Path $env:TEMP 'snapflow-src'
  Invoke-WebRequest "$Repo/archive/refs/heads/main.zip" -OutFile $zip
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive $zip $tmp
  New-Item -ItemType Directory -Force $Dir | Out-Null
  Copy-Item (Join-Path $tmp 'snapflow-main\*') $Dir -Recurse -Force
}

# 3. Paket npm + Chromium (npm & Playwright melewati yang sudah terpasang)
Push-Location $Dir
try { npm install --no-audit --no-fund; if ($LASTEXITCODE) { throw 'npm install gagal.' } } finally { Pop-Location }

Write-Host "`nSnapflow siap di $Dir"
Write-Host 'Coba di AI: "Pakai skill snapflow. Buat video tutorial aplikasi saya di http://localhost:8000"'
