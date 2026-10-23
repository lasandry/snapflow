#!/usr/bin/env node
/**
 * make-video.mjs — olah video mentah hasil capture.mjs menjadi video tutorial siap unggah.
 *
 *   node scripts/make-video.mjs output/app/demo-16x9 [opsi]
 *
 * Opsi:
 *   --ratio 9:16        bingkai ulang ke rasio lain (latar blur), default = rasio rekaman
 *   --width 1080        lebar output (tinggi dihitung dari rasio)
 *   --speed 1.25        percepat/perlambat video
 *   --intro "Judul"     kartu judul di awal (default: nama aplikasi; --no-intro untuk mematikan)
 *   --outro "Teks"      kartu penutup
 *   --burn-subs         tanamkan subtitle (judul/deskripsi langkah) ke video
 *   --music lofi        musik latar dibuat otomatis sepanjang video: lofi (default) | corporate | file.mp3
 *                       (volume --music-volume; default 0.9, atau 0.35 + mengecil saat narasi bila ada --voiceover)
 *   --sfx               efek suara klik mouse di setiap klik (pengali volume --sfx-volume 1)
 *   --clips             juga potong video jadi klip pendek per fitur (mengikuti chapter) untuk Reels/TikTok
 *   --logo logo.png     watermark + logo di kartu & thumbnail (default: brand.logo di flow)
 *   --brand-color #hex  warna kartu dan aksen thumbnail (default: brand.color di flow)
 *   --voiceover vo/     narasi per langkah: 00.mp3 = pembuka, 01.mp3 = langkah 1, ... (musik otomatis mengecil saat narasi)
 *   --gif               juga buat preview GIF
 *   --name tutorial     nama file output (tanpa ekstensi)
 *   --no-zoom           matikan auto-zoom mengikuti kursor
 *   --zoom-level 2      paksa tingkat zoom (default otomatis 1.8, menyesuaikan ukuran elemen)
 *   --zoom-ramp 0.5     durasi transisi zoom masuk/keluar (detik)
 *   --zoom-quality fast render zoom lebih cepat (sedikit kurang halus)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { makeMusic } from './make-music.mjs';
import { makeThumbnail } from './thumbnail.mjs';

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) { a._.push(k); continue; }
    const key = k.slice(2);
    if (key.startsWith('no-')) { a[key.slice(3)] = false; continue; }
    const n = argv[i + 1];
    if (n === undefined || n.startsWith('--')) a[key] = true; else { a[key] = n; i++; }
  }
  return a;
}
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const srtTime = (ms) => {
  ms = Math.max(0, Math.round(ms));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, x = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(x).padStart(3, '0')}`;
};
function findFont() {
  const cands = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'];
  try { const f = execFileSync('fc-match', ['-f', '%{file}', 'sans:bold'], { encoding: 'utf8' }).trim(); if (f) cands.unshift(f); } catch {}
  return cands.find((f) => fs.existsSync(f)) || null;
}
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\u2019").replace(/:/g, '\\:').replace(/%/g, '\\%');
const escPath = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // root = folder hasil jadi; dir = folder kerja (bahan mentah di root/raw, atau root untuk hasil versi lama)
  const root = path.resolve(args._[0] || '.');
  const dir = fs.existsSync(path.join(root, 'raw', 'manifest.json')) ? path.join(root, 'raw') : root;
  const rel = (f) => path.relative(root, path.join(dir, f)).split(path.sep).join('/');
  const mf = path.join(dir, 'manifest.json');
  if (!fs.existsSync(mf)) { console.error(`manifest.json tidak ada di ${dir}. Jalankan capture.mjs dulu.`); process.exit(1); }
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  if (!m.video) { console.error('Rekaman video tidak ada (capture dijalankan dengan --no-video?).'); process.exit(1); }
  if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.error('ffmpeg belum terpasang. Jalankan installer (install.ps1 / install.sh) atau pasang ffmpeg.'); process.exit(1); }

  const src = path.join(dir, m.video);
  const ratio = String(args.ratio || m.format.ratio);
  const [rw, rh] = ratio.split(/[:x/]/).map(Number);
  const W = even(Number(args.width || (args.ratio ? (rw < rh ? 1080 : 1920) : m.format.output.width)));
  const H = even(W * rh / rw);
  const fps = m.format.fps || 30;
  const speed = Number(args.speed || 1);
  const name = args.name || `tutorial-${ratio.replace(/[:/]/g, 'x')}`;
  const font = findFont();
  const fontArg = font ? `fontfile='${escPath(font)}':` : '';
  const introText = args.intro === false ? null : (typeof args.intro === 'string' ? args.intro : m.name);
  const outroText = typeof args.outro === 'string' ? args.outro : null;
  const cardDur = 2.5;
  const offsetS = (m.videoStartOffsetMs || 0) / 1000;
  const tag = ratio.replace(/[:/]/g, 'x');
  const en = (m.lang || 'id') === 'en';
  // brand: warna kartu/aksen + logo (flow "brand" atau --brand-color / --logo)
  const brandColor = String(args['brand-color'] || m.brand?.color || '#111827').replace('#', '');
  const logo = [typeof args.logo === 'string' ? path.resolve(args.logo) : null, m.brand?.logo].find((p) => p && fs.existsSync(p)) || null;
  const lightBrand = luminance(brandColor) > 0.6;
  const cardText = lightBrand ? '0x111111' : 'white';

  // ---------- SRT (relatif ke klip utama, sudah disesuaikan speed) ----------
  // Teks subtitle = naskah narasi langkah. Gaya Netflix: maks 2 baris per cue, cue panjang dipecah berurutan.
  const maxCh = H > W ? 30 : 42;
  const slots = m.steps.map((s, i) => {
    const next = m.steps[i + 1];
    const start = s.startMs / speed, end = Math.max(start + 1200, (next ? next.startMs : s.endMs) / speed - 100);
    return { start, end, title: s.title, text: s.narration || s.description || s.title };
  });
  const cues = [];
  for (const sl of slots) {
    const parts = subChunks(sl.text, maxCh);
    const total = parts.reduce((n, p) => n + p.length, 0);
    let t = sl.start;
    for (const p of parts) {
      const d = (sl.end - sl.start) * p.length / total;
      cues.push({ start: t, end: t + d - 40, text: p });
      t += d;
    }
  }
  const toSrt = (shift) => cues.map((c, i) => `${i + 1}\n${srtTime(c.start + shift)} --> ${srtTime(c.end + shift)}\n${c.text}\n`).join('\n');
  // ASS untuk burn-in: ukuran dalam piksel nyata (PlayRes = ukuran video)
  const assTime = (ms) => { const cs = Math.round(ms / 10); return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`; };
  // gaya Netflix: teks putih tebal, outline hitam + bayangan, tanpa kotak; 9:16 dinaikkan agar tidak tertutup UI Reels/TikTok
  const fsPx = Math.round(H > W ? W * 0.048 : H * 0.042);
  const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\n` +
    `Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n` +
    `Style: Step,Arial,${fsPx},&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,-1,0,0,0,100,100,0.5,0,1,${Math.max(2, Math.round(fsPx * 0.06))},${Math.max(1, Math.round(fsPx * 0.04))},2,${Math.round(W * 0.06)},${Math.round(W * 0.06)},${Math.round(H * (H > W ? 0.18 : 0.07))},1\n` +
    `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` +
    cues.map((c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Step,,0,0,0,,{\\fad(120,120)}${c.text.replace(/\n/g, '\\N')}`).join('\n') + '\n';
  const mainSrt = path.join(dir, '.main.ass');
  fs.writeFileSync(mainSrt, ass);

  fs.writeFileSync(path.join(dir, `${name}.srt`), toSrt(introText ? cardDur * 1000 : 0));

  // ---------- Naskah voice-over (untuk dibacakan / TTS AI) ----------
  // ponytail: estimasi 2,5 kata/detik (bahasa Indonesia santai); waktu = posisi di video final
  const shift = introText ? cardDur * 1000 : 0;
  const clock = (ms) => srtTime(ms).slice(3, 8);
  const vo = [`# Naskah Voice-Over — ${m.name}`, `# Video: ${name}.mp4 · rasio ${ratio}`, `# Simpan audio tiap bagian sesuai nama file (→ 01.mp3 dst.) di satu folder, lalu: --voiceover <folder>`, ''];
  if (introText) vo.push(`[00:00] Pembuka  → 00.mp3`, introText, '');
  for (const sl of slots) {
    const words = sl.text.split(/\s+/).filter(Boolean).length;
    const need = words / 2.5, slot = (sl.end - sl.start) / 1000;
    vo.push(`[${clock(sl.start + shift)} – ${clock(sl.end + shift)}] ${sl.title}  → ${String(slots.indexOf(sl) + 1).padStart(2, '0')}.mp3${need > slot ? `  ⚠ terlalu panjang (±${need.toFixed(0)} dtk bicara, slot ${slot.toFixed(0)} dtk)` : ''}`, sl.text, '');
  }
  if (outroText) vo.push(`[penutup]`, outroText, '');
  fs.writeFileSync(path.join(root, `voiceover-${ratio.replace(/[:/]/g, 'x')}.txt`), vo.join('\n'));
  // versi teks saja, siap ditempel ke TTS
  fs.writeFileSync(path.join(root, 'voiceover-teks.txt'), [introText, ...slots.map((s) => s.text), outroText].filter(Boolean).join('\n\n') + '\n');

  // ---------- Filter graph ----------
  const inputs = ['-ss', offsetS.toFixed(3), '-i', src];
  const recR = m.format.output.width / m.format.output.height;
  const tgtR = W / H;
  let f = `[0:v]setpts=PTS/${speed},fps=${fps},setsar=1`;

  // ---------- Auto-zoom mengikuti kursor ----------
  const zoomOn = args.zoom !== false && (m.zoom?.enabled ?? false) && (m.zoomEvents || []).length > 0;
  if (zoomOn) {
    const z = buildZoom(m.zoomEvents, speed, {
      level: args['zoom-level'] ? Number(args['zoom-level']) : null,
      rampIn: Number(args['zoom-ramp'] || m.zoom.rampIn || 0.45),
      rampOut: Number(args['zoom-ramp'] || m.zoom.rampOut || 0.6),
      pan: Number(m.zoom.pan || 0.5), hold: Number(m.zoom.hold || 0.5),
    });
    // zoompan dari rekaman resolusi tinggi (supersample) ke ukuran output; rekaman lama (1x) diperbesar 2x agar pan halus
    const OW = m.format.output.width, OH = m.format.output.height;
    const RW = m.format.record?.width || OW, RH = m.format.record?.height || OH;
    const up = args['zoom-quality'] === 'fast' || RW >= OW * 2 ? 1 : 2;
    const zt = (e) => e.replace(/\bt\b/g, 'it');
    f += `,scale=${RW * up}:${RH * up}:flags=lanczos` +
      `,zoompan=z='${zt(z.z)}':x='clip((${zt(z.cx)})*iw-iw/zoom/2,0,iw-iw/zoom)':y='clip((${zt(z.cy)})*ih-ih/zoom/2,0,ih-ih/zoom)':d=1:s=${OW}x${OH}:fps=${fps}`;
    console.log(`Auto-zoom: ${m.zoomEvents.length} interaksi → ${z.segments} segmen zoom`);
  }
  if (Math.abs(recR - tgtR) < 0.01) {
    f += `,scale=${W}:${H}:flags=lanczos[main0];`;
  } else {
    // bingkai ulang: latar blur + konten utuh di tengah
    f += `,split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=20:2,eq=brightness=-0.08[bg];` +
      `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[main0];`;
  }
  let idx = 1;
  // logo: watermark di pojok kanan atas video + di kartu pembuka/penutup
  const nCards = (introText ? 1 : 0) + (outroText ? 1 : 0);
  if (logo) {
    inputs.push('-loop', '1', '-i', logo);
    const wmW = even(W * (H > W ? 0.12 : 0.07)), lgH = even(Math.min(W, H) * 0.14);
    f += `[${idx}:v]format=rgba,split=${1 + nCards}[lgw]${Array.from({ length: nCards }, (_, k) => `[lgc${k}]`).join('')};` +
      `[lgw]scale=${wmW}:-2,colorchannelmixer=aa=0.7[wm];` +
      Array.from({ length: nCards }, (_, k) => `[lgc${k}]scale=-2:${lgH}[lg${k}];`).join('') +
      `[main0][wm]overlay=W-w-${Math.round(W * 0.03)}:${Math.round(H * 0.03)}:shortest=1[main1];`;
    idx++;
  } else f += `[main0]null[main1];`;
  if (args['burn-subs']) {
    f += `[main1]subtitles='${escPath(mainSrt)}'[main];`;
  } else f += `[main1]null[main];`;

  let cardNo = 0;
  const card = (label, text) => {
    const fsz = Math.round(Math.min(W, H) / 14);
    const lines = wrap(text, H > W ? 18 : 32);
    const lineH = Math.round(fsz * 1.3), lgH = even(Math.min(W, H) * 0.14);
    const top = `(h-${lines.length * lineH}${logo ? `-${lgH + lineH}` : ''})/2`;
    let dt = '';
    lines.forEach((ln, k) => {
      dt += `,drawtext=${fontArg}text='${esc(ln)}':fontcolor=${cardText}:fontsize=${fsz}:x=(w-text_w)/2:y=${top}${logo ? `+${lgH + lineH}` : ''}+${k * lineH}`;
    });
    inputs.push('-f', 'lavfi', '-t', String(cardDur), '-i', `color=c=0x${brandColor}:s=${W}x${H}:r=${fps}`);
    const k = cardNo++;
    const bg = `[${idx++}:v]setsar=1`;
    return logo
      ? `${bg}[cbg${k}];[cbg${k}][lg${k}]overlay=(W-w)/2:(H-${lines.length * lineH}-${lgH + lineH})/2:shortest=1${dt},fade=t=in:st=0:d=0.4,fade=t=out:st=${cardDur - 0.4}:d=0.4[${label}];`
      : `${bg}${dt},fade=t=in:st=0:d=0.4,fade=t=out:st=${cardDur - 0.4}:d=0.4[${label}];`;
  };
  const seq = [];
  if (introText) { f += card('intro', introText); seq.push('[intro]'); }
  seq.push('[main]');
  if (outroText) { f += card('outro', outroText); seq.push('[outro]'); }
  f += `${seq.join('')}concat=n=${seq.length}:v=1:a=0[v]`;

  const out = path.join(root, `${name}.mp4`);
  const cmd = ['-y', '-hide_banner', '-loglevel', 'error', ...inputs];
  // ---------- Audio: musik latar (--music lofi|corporate|file) + voice-over + efek klik (--sfx) ----------
  let audioMap = [];
  const aud = [], mixIn = [];
  const fmtA = 'aformat=sample_rates=44100:channel_layouts=stereo';
  const shiftS = introText ? cardDur : 0;
  const srcDur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], { encoding: 'utf8' }).stdout) || 0;
  const totalS = shiftS + (srcDur - offsetS) / speed + (outroText ? cardDur : 0);
  let music = args.music === true ? 'lofi' : args.music;
  if (music && !fs.existsSync(music)) {
    // bukan file → nama gaya: musik dibuat baru, sepanjang video
    const file = path.join(dir, `musik-${music}.mp3`);
    if (makeMusic(music, totalS, file)) { console.log(`Musik: ${music} (${totalS.toFixed(0)} dtk, dibuat otomatis)`); music = file; }
    else { console.warn('Musik gagal dibuat, video tanpa musik.'); music = null; }
  }
  if (music) {
    cmd.push('-stream_loop', '-1', '-i', path.resolve(music));
    aud.push(`[${idx++}:a]${fmtA},volume=${Number(args['music-volume'] || (typeof args.voiceover === 'string' ? 0.35 : 0.9))},afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, totalS - 2.5).toFixed(2)}:d=2.5[mus]`);
  }
  // voice-over per langkah: file 00.* = pembuka, 01.* = langkah 1, 02.* = langkah 2, dst. (mis. 01-login.mp3)
  const vos = [];
  if (typeof args.voiceover === 'string') {
    const vd = path.resolve(args.voiceover);
    const files = fs.existsSync(vd) ? fs.readdirSync(vd).filter((x) => /^\d+(\D.*)?\.(mp3|m4a|wav|ogg)$/i.test(x)).sort() : [];
    if (!files.length) console.warn(`Voice-over: tidak ada file 01.mp3, 02.mp3, ... di ${vd}`);
    for (const file of files) {
      const n = parseInt(file, 10);
      const sl = n === 0 ? { start: -shiftS * 1000, end: 0 } : slots[n - 1];
      if (!sl) { console.warn(`Voice-over: ${file} dilewati, langkah ${n} tidak ada.`); continue; }
      const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(vd, file)], { encoding: 'utf8' }).stdout) * 1000;
      if (dur > sl.end - sl.start + 300) console.warn(`Voice-over: ${file} ${(dur / 1000).toFixed(1)} dtk, lebih panjang dari langkahnya (${((sl.end - sl.start) / 1000).toFixed(1)} dtk) → tumpang tindih. Persingkat narasi atau tambah "pauseAfterStep".`);
      const at = Math.max(0, Math.round(sl.start + shiftS * 1000));
      cmd.push('-i', path.join(vd, file));
      aud.push(`[${idx++}:a]${fmtA},adelay=${at}:all=1[vo${vos.length}]`);
      vos.push(`[vo${vos.length}]`);
    }
  }
  if (vos.length) {
    aud.push(`${vos.join('')}amix=inputs=${vos.length}:duration=longest:normalize=0[vo]`);
    // musik otomatis mengecil saat narasi berbicara (ducking)
    if (music) { aud.push(`[vo]asplit[vo_out][vo_sc]`, `[mus][vo_sc]sidechaincompress=threshold=0.02:ratio=10:attack=20:release=500[musd]`); mixIn.push('[musd]', '[vo_out]'); }
    else mixIn.push('[vo]');
  } else if (music) mixIn.push('[mus]');
  if (args.sfx && m.clicks?.length) {
    // klik mouse disintesis dari derau: dua letupan sangat pendek (tekan + lepas, jeda 60 ms), difilter 1,5–7 kHz
    const clickEnv = m.clicks.map((c) => {
      const a = (shiftS + c / 1000 / speed).toFixed(3);
      return `if(between(t,${a},${a}+0.012),exp(-(t-${a})*600),0)+0.55*if(between(t,${a}+0.06,${a}+0.07),exp(-(t-${a}-0.06)*800),0)`;
    });
    cmd.push('-f', 'lavfi', '-i', `aevalsrc='(random(0)*2-1)*(${clickEnv.join('+')})':s=44100:c=stereo`);
    aud.push(`[${idx++}:a]highpass=f=1500,lowpass=f=7000,volume=${(1.6 * Number(args['sfx-volume'] || 1)).toFixed(2)}[clk]`); mixIn.push('[clk]');
  }
  if (mixIn.length) {
    // apad: audio tidak pernah lebih pendek dari video (-shortest mengikuti video)
    f += ';' + aud.join(';') + `;${mixIn.join('')}amix=inputs=${mixIn.length}:duration=longest:normalize=0,apad[a]`;
    audioMap = ['-map', '[a]', '-shortest', '-c:a', 'aac', '-b:a', '160k'];
  }
  cmd.push('-filter_complex', f, '-map', '[v]', ...audioMap,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(args.crf || 17), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out);
  const r = spawnSync('ffmpeg', cmd, { stdio: 'inherit' });
  fs.rmSync(mainSrt, { force: true });
  if (r.status !== 0) { console.error('ffmpeg gagal.'); process.exit(1); }
  console.log(`Video: ${out} (${W}x${H}, rasio ${ratio})`);
  console.log(`Subtitle: ${path.join(dir, name + '.srt')}`);

  if (args.gif) {
    const gif = path.join(root, `${name}.gif`);
    const gw = Math.min(640, W);
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-vf',
      `fps=10,scale=${gw}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer`, gif], { stdio: 'inherit' });
    console.log(`GIF: ${gif}`);
  }

  // ---------- Chapter YouTube (min. 10 dtk per chapter, chapter pertama 00:00) ----------
  const chapters = [];
  slots.forEach((sl, i) => {
    const t = i === 0 ? 0 : sl.start + shift, last = chapters[chapters.length - 1];
    if (last && t - last.t < 10000) last.titles.push(sl.title); else chapters.push({ t, titles: [sl.title] });
  });
  while (chapters.length > 1 && totalS * 1000 - chapters[chapters.length - 1].t < 10000) {
    const end = chapters.pop(); chapters[chapters.length - 1].titles.push(...end.titles);
  }
  chapters.forEach((c, i) => { c.title = c.titles.length > 2 ? `${c.titles[0]} – ${c.titles[c.titles.length - 1]}` : c.titles.join(' & '); c.end = chapters[i + 1] ? chapters[i + 1].t : totalS * 1000; });
  fs.writeFileSync(path.join(dir, `chapters-${tag}.txt`), chapters.map((c) => `${clock(c.t)} ${c.title}`).join('\n') + '\n' +
    (chapters.length < 3 ? `\n# Catatan: YouTube butuh minimal 3 chapter (masing-masing ≥ 10 dtk). Video ini terlalu pendek, chapter tidak akan tampil.\n` : ''));
  console.log(`Chapter YouTube: ${path.join(dir, `chapters-${tag}.txt`)}`);

  // ---------- Thumbnail / cover ----------
  const shots = m.steps.filter((s) => s.screenshot && s.status === 'ok');
  const pick = shots.find((s) => s.index === Number(m.thumbnail)) || shots[Math.min(1, shots.length - 1)];
  if (pick) {
    const thumb = path.join(root, `thumbnail-${tag}.jpg`);
    try {
      await makeThumbnail({
        shot: path.join(dir, pick.screenshot), title: introText || m.name, app: m.name,
        label: m.mode === 'test' ? (en ? 'TEST RUN' : 'UJI COBA') : 'TUTORIAL',
        meta: en ? `${m.steps.length} easy steps` : `${m.steps.length} langkah mudah`,
        color: brandColor, light: lightBrand, logo, portrait: H > W, out: thumb,
      });
      console.log(`Thumbnail: ${thumb}`);
    } catch (e) { console.warn(`Thumbnail gagal dibuat: ${e.message.split('\n')[0]}`); }
  }

  // ---------- Klip pendek per fitur (--clips), mengikuti chapter ----------
  if (args.clips) {
    const cd = path.join(root, `clips-${tag}`);
    fs.mkdirSync(cd, { recursive: true });
    chapters.forEach((c, i) => {
      const file = path.join(cd, `${String(i + 1).padStart(2, '0')}-${c.titles[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.mp4`);
      spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', (c.t / 1000).toFixed(2), '-to', (c.end / 1000).toFixed(2), '-i', out,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-af', 'afade=t=in:d=0.3', '-movflags', '+faststart', file], { stdio: 'inherit' });
    });
    console.log(`Klip per fitur: ${cd} (${chapters.length} klip)`);
  }
  m.outputs ={ ...(m.outputs || {}), [name]: { video: `${name}.mp4`, srt: rel(`${name}.srt`), ratio, width: W, height: H } };
  fs.writeFileSync(mf, JSON.stringify(m, null, 2));
}

/**
 * Ubah daftar interaksi menjadi ekspresi ffmpeg z(t), cx(t), cy(t) (smoothstep antar keyframe).
 * Interaksi yang berdekatan digabung jadi satu segmen: kamera tetap zoom dan menggeser (pan)
 * dari field ke field, lalu zoom keluar setelah interaksi terakhir.
 */
function buildZoom(events, speed, o) {
  const ev = events.map((e) => ({ ...e, start: e.start / 1000 / speed, end: e.end / 1000 / speed, level: o.level || e.level }))
    .sort((a, b) => a.start - b.start);
  const segs = [];
  for (const e of ev) {
    const cur = segs[segs.length - 1];
    const last = cur && cur.items[cur.items.length - 1];
    const gap = cur ? e.start - cur.end : Infinity;
    // gabung bila masih di langkah yang sama & jeda pendek; pindah langkah/halaman → zoom keluar dulu
    if (cur && !last.cut && ((last.step === e.step && gap < 1.5) || gap < 0.4)) { cur.items.push(e); cur.end = Math.max(cur.end, e.end); }
    else segs.push({ items: [e], end: e.end });
  }
  const Z = [[0, 1]], X = [[0, 0.5]], Y = [[0, 0.5]];
  const push = (arr, t, v) => { const last = arr[arr.length - 1]; arr.push([Math.max(t, last[0] + 0.01), v]); };
  const val = (arr) => arr[arr.length - 1][1];
  for (const s of segs) {
    const first = s.items[0];
    const t0 = Math.max(0, first.start - o.rampIn * 0.5);
    // lompat ke titik fokus saat masih zoom 1x (tidak terlihat), lalu zoom masuk
    push(X, t0 - 0.02, val(X)); push(X, t0, first.x);
    push(Y, t0 - 0.02, val(Y)); push(Y, t0, first.y);
    push(Z, t0, 1); push(Z, t0 + o.rampIn, first.level);
    for (const e of s.items.slice(1)) {
      const t = e.start;
      push(X, t, val(X)); push(X, t + o.pan, e.x);
      push(Y, t, val(Y)); push(Y, t + o.pan, e.y);
      push(Z, t, val(Z)); push(Z, t + o.pan, e.level);
    }
    const tEnd = s.end + (s.items[s.items.length - 1].cut ? 0.05 : o.hold);
    push(Z, tEnd, val(Z)); push(Z, tEnd + o.rampOut, 1);
  }
  return { z: expr(Z), cx: expr(X), cy: expr(Y), segments: segs.length };
}
function expr(kf) {
  const n = (v) => +v.toFixed(4);
  let acc = String(n(kf[kf.length - 1][1]));
  for (let i = kf.length - 1; i >= 1; i--) {
    const [t0, a] = kf[i - 1], [t1, b] = kf[i];
    const seg = a === b ? `${n(a)}` : (() => {
      const u = `clip((t-${n(t0)})/${n(t1 - t0)},0,1)`;
      return `(${n(a)}+(${n(b - a)})*${u}*${u}*(3-2*${u}))`;
    })();
    acc = `if(lt(t,${n(t1)}),${seg},${acc})`;
  }
  return acc;
}

const luminance = (hex) => { const n = parseInt(hex.padStart(6, '0'), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

// Pecah teks jadi cue subtitle: per kalimat, maks 2 baris × maxCh karakter per cue.
function subChunks(text, maxCh) {
  const out = [];
  for (const sentence of String(text).split(/(?<=[.!?])\s+/).filter(Boolean)) {
    // seimbangkan panjang baris (hindari satu kata yatim di baris kedua)
    const k = wrap(sentence, maxCh, Infinity).length;
    let w = Math.ceil(sentence.length / k);
    while (wrap(sentence, w, Infinity).length > k) w++;
    const lines = wrap(sentence, w, Infinity);
    for (let i = 0; i < lines.length; i += 2) out.push(lines.slice(i, i + 2).join('\n'));
  }
  return out.length ? out : [''];
}

function wrap(text, max, limit = 4) {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  return lines.slice(0, limit);
}

main().catch((e) => { console.error(e); process.exit(1); });
