#!/usr/bin/env node
/**
 * run.mjs — satu perintah untuk semuanya: capture → video → dokumentasi, untuk satu atau banyak rasio.
 *
 *   node scripts/run.mjs --flow flows/app.json --ratios 16:9,9:16 --mode demo --burn-subs
 *   node scripts/run.mjs --flow flows/app.json --presets youtube,reels
 *   node scripts/run.mjs --flow flows/app.json --mode test          (uji coba / percobaan)
 *
 * Opsi lain diteruskan: --speed, --intro, --outro, --music [lofi|corporate|file], --sfx, --gif, --embed, --headed, --crawl, --no-video
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const get = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
const has = (k) => argv.includes('--' + k);
if (!get('flow')) { console.log('Pemakaian: node scripts/run.mjs --flow <flow.json> [--ratios 16:9,9:16 | --presets youtube,reels] [--mode demo|test]'); process.exit(1); }

const mode = get('mode') || 'demo';
const targets = get('presets') ? get('presets').split(',').map((p) => ['--preset', p.trim()])
  : get('ratios') ? get('ratios').split(',').map((r) => ['--ratio', r.trim()]) : [[]];
const passCapture = ['headed', 'crawl', 'no-video'].filter(has).map((k) => '--' + k);
// caption di halaman dimatikan: video bersih, atau subtitle ditanam lewat --burn-subs (tidak dobel)
if (!has('page-captions')) passCapture.push('--captions', 'none');
const passVideo = [];
for (const k of ['speed', 'intro', 'outro', 'music', 'music-volume', 'sfx-volume', 'voiceover', 'logo', 'brand-color', 'crf', 'zoom-level', 'zoom-ramp']) if (get(k) && !get(k).startsWith('--')) passVideo.push('--' + k, get(k));
if (has('music') && !passVideo.includes('--music')) passVideo.push('--music', 'lofi'); // --music tanpa nilai = lofi
for (const k of ['burn-subs', 'gif', 'no-intro', 'no-zoom', 'sfx', 'clips']) if (has(k)) passVideo.push('--' + k);
const passDocs = [];
for (const k of ['title', 'lang']) if (get(k)) passDocs.push('--' + k, get(k));
if (has('embed')) passDocs.push('--embed');

const node = (script, a) => {
  const r = spawnSync(process.execPath, [path.join(here, script), ...a], { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  return r;
};
// setiap run → folder baru bertanggal (waktu lokal), hasil lama tidak tertimpa
const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
const runDir = path.join(get('out') || 'output', `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`);
let exit = 0;
for (const t of targets) {
  console.log(`\n=== ${mode.toUpperCase()} ${t.join(' ') || '(format dari flow)'} ===`);
  // <out>/<tanggal_jam>/<youtube|tiktok|16x9>/ berisi hasil jadi; bahan mentah (rekaman, screenshot, manifest) di raw/
  const target = t[1] ? t[1].replace(/[:/]/g, 'x') : 'video';
  const jobDir = path.join(runDir, mode === 'test' ? `test-${target}` : target);
  const cap = node('capture.mjs', ['--flow', get('flow'), '--mode', mode, ...t, '--out', path.join(jobDir, 'raw'), ...passCapture]);
  const m = (cap.stdout || '').match(/→ (.+)\n/);
  if (!m) { exit = 1; continue; }
  if (cap.status === 2) exit = 2;
  if (!has('no-video')) node('make-video.mjs', [jobDir, ...passVideo]);
  node('build-docs.mjs', [jobDir, ...passDocs]);
}
console.log(`\nSemua hasil: ${path.resolve(runDir)}`);
process.exit(exit);
