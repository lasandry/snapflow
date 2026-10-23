#!/usr/bin/env node
/**
 * build-docs.mjs — buat dokumentasi (Word .docx + HTML) dari manifest.json hasil capture.mjs.
 *
 *   node scripts/build-docs.mjs output/app/demo-16x9 [--embed] [--title "Panduan X"] [--lang id|en]
 *
 *   --embed   gambar dimasukkan ke HTML (base64) → satu file mandiri, mudah dikirim
 */
import fs from 'node:fs';
import path from 'node:path';
import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, TableOfContents } from 'docx';

const args = (() => {
  const a = { _: [] }; const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i++) {
    if (!v[i].startsWith('--')) { a._.push(v[i]); continue; }
    const k = v[i].slice(2), n = v[i + 1];
    if (n === undefined || n.startsWith('--')) a[k] = true; else { a[k] = n; i++; }
  }
  return a;
})();

const L = {
  id: { toc: 'Daftar Isi', step: 'Langkah', page: 'Halaman', video: 'Video Tutorial', gen: 'Dibuat otomatis', ok: 'Berhasil', failed: 'Gagal',
    result: 'Hasil Pengujian', status: 'Status', error: 'Keterangan', ratio: 'Rasio', size: 'Ukuran', mode: 'Mode', demo: 'Demo', test: 'Pengujian',
    doc: 'Dokumentasi', guide: 'Panduan Pengguna', version: 'Versi', date: 'Tanggal', tocHint: 'Bila daftar isi kosong, klik kanan lalu pilih Update Field.' },
  en: { toc: 'Contents', step: 'Step', page: 'Page', video: 'Video Tutorial', gen: 'Generated automatically', ok: 'Passed', failed: 'Failed',
    result: 'Test Results', status: 'Status', error: 'Notes', ratio: 'Ratio', size: 'Size', mode: 'Mode', demo: 'Demo', test: 'Test',
    doc: 'Documentation', guide: 'User Guide', version: 'Version', date: 'Date', tocHint: 'If the table of contents is empty, right-click it and choose Update Field.' },
};
const escHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const dir = path.resolve(args._[0] || '.');
const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const t = L[args.lang || m.lang] || L.id;
const title = args.title || `${t.doc} ${m.name}`;
const loc = (args.lang || m.lang) === 'en' ? 'en-US' : 'id-ID';
const date = new Date(m.generatedAt).toLocaleString(loc, { dateStyle: 'long', timeStyle: 'short' });
const day = new Date(m.generatedAt).toLocaleDateString(loc, { dateStyle: 'long' });
const videos = Object.values(m.outputs || {});
const isTest = m.mode === 'test';

// ---------- Word (.docx) ----------
// URL aplikasi (localhost/staging) sengaja tidak dicantumkan di dokumen.
const meta = `${t.gen} · ${date} · ${t.mode}: ${t[m.mode] || m.mode} · ${t.ratio} ${m.format.ratio}`;
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
const maxW = m.format.output.height > m.format.output.width ? 280 : 600; // px pada A4 (≈ lebar area teks)
const P = (text, o = {}) => new Paragraph({ ...o, children: [new TextRun({ text: String(text), ...(o.run || {}) })] });
const C = (text, run = {}, o = {}) => P(text, { alignment: AlignmentType.CENTER, ...o, run });
// halaman sampul: logo (PNG), judul, deskripsi, versi & tanggal
const body = [new Paragraph({ spacing: { before: 2400 } })];
const logo = m.brand?.logo;
if (logo && /\.png$/i.test(logo) && fs.existsSync(logo)) {
  const data = fs.readFileSync(logo); const { w, h } = pngSize(data); const k = Math.min(1, 160 / w, 160 / h);
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new ImageRun({ type: 'png', data, transformation: { width: Math.round(w * k), height: Math.round(h * k) } })] }));
}
const accent = (m.brand?.color || '#2457F5').replace('#', '');
body.push(C(t.guide.toUpperCase(), { color: accent, bold: true, size: 24 }, { spacing: { after: 200 } }));
body.push(C(m.name, { bold: true, size: 56 }, { spacing: { after: 300 } }));
if (m.description) body.push(C(m.description, { size: 26, color: '444444' }, { spacing: { after: 1200 } }));
if (m.version) body.push(C(`${t.version} ${m.version}`, { color: '6B6F7B' }));
body.push(C(`${t.date}: ${day}`, { color: '6B6F7B' }));
// daftar isi otomatis (Word memperbarui saat dokumen dibuka)
body.push(P(t.toc, { heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
body.push(new TableOfContents(t.toc, { hyperlink: true, headingStyleRange: '1-1' }));
body.push(P(t.tocHint, { run: { color: '9A9EAB', size: 16, italics: true } }));
body.push(P(meta, { run: { color: '9A9EAB', size: 16 } }));
if (isTest) {
  body.push(P(`${t.result} — ${m.summary.ok}/${m.summary.total}`, { heading: HeadingLevel.HEADING_1 }));
  const cell = (x, color) => new TableCell({ children: [P(x, color ? { run: { color } } : {})] });
  body.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    new TableRow({ tableHeader: true, children: ['#', t.step, t.status, t.error].map((x) => cell(x)) }),
    ...m.steps.map((s) => new TableRow({ children: [cell(s.index), cell(s.title), cell(s.status === 'ok' ? t.ok : t.failed, s.status === 'ok' ? '15803D' : 'B91C1C'), cell(s.error || '')] })),
  ] }));
}
for (const s of m.steps) {
  body.push(P(`${s.index}. ${s.title}`, { heading: HeadingLevel.HEADING_1, pageBreakBefore: s.index > 1 ? !!s.screenshot : !isTest }));
  if (s.description) body.push(P(s.description));
  if (s.screenshot) {
    const data = fs.readFileSync(path.join(dir, s.screenshot));
    const { w, h } = pngSize(data); const k = Math.min(1, maxW / w);
    body.push(new Paragraph({ children: [new ImageRun({ type: 'png', data, transformation: { width: Math.round(w * k), height: Math.round(h * k) } })] }));
  }
  if (s.error) body.push(P(`⚠ ${s.error}`, { run: { color: 'B91C1C' } }));
}
const doc = new Document({ creator: 'Snapflow', title, features: { updateFields: true }, styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } }, sections: [{ children: body }] });
fs.writeFileSync(path.join(dir, 'DOKUMENTASI.docx'), await Packer.toBuffer(doc));

// ---------- HTML ----------
const img = (p) => {
  if (!args.embed) return p;
  const b = fs.readFileSync(path.join(dir, p));
  return `data:image/png;base64,${b.toString('base64')}`;
};
const portrait = m.format.output.height > m.format.output.width;
const html = `<!doctype html><html lang="${args.lang || m.lang || 'id'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title>
<style>
:root{--bg:#f7f7f8;--fg:#17181c;--muted:#6b6f7b;--card:#fff;--line:#e4e5ea;--accent:#2457f5;--ok:#15803d;--bad:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#111215;--fg:#ececf1;--muted:#9a9eab;--card:#1a1b20;--line:#2b2d35;--accent:#7c9cff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:32px 16px 80px;display:grid;grid-template-columns:240px 1fr;gap:32px}
nav{position:sticky;top:16px;align-self:start;font-size:14px}nav ol{padding-left:18px;margin:8px 0}nav a{color:var(--muted);text-decoration:none}nav a:hover{color:var(--accent)}
h1{font-size:30px;line-height:1.2;margin:0 0 8px}.meta{color:var(--muted);font-size:13px;margin-bottom:24px}
section.step{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin:0 0 20px}
section.step h2{font-size:19px;margin:0 0 6px}.num{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;font-size:14px;margin-right:8px}
.url{font:12px ui-monospace,monospace;color:var(--muted);word-break:break-all}
figure{margin:14px 0 0}figure img{display:block;width:100%;${portrait ? 'max-width:380px;' : ''}height:auto;border:1px solid var(--line);border-radius:10px}
.err{color:var(--bad);font-size:14px}.badge{font-size:12px;padding:2px 8px;border-radius:99px;border:1px solid currentColor;margin-left:6px}
.ok{color:var(--ok)}.bad{color:var(--bad)}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left}
video{width:100%;${portrait ? 'max-width:380px;' : ''}border-radius:10px;background:#000}
@media (max-width:800px){.wrap{grid-template-columns:1fr}nav{position:static}}
@media print{nav{display:none}.wrap{display:block}section.step{break-inside:avoid}}
</style></head><body><div class="wrap">
<nav><strong>${t.toc}</strong><ol>${m.steps.map((s) => `<li><a href="#${s.id}">${escHtml(s.title)}</a></li>`).join('')}</ol></nav>
<main><h1>${escHtml(title)}</h1>
${m.description ? `<p>${escHtml(m.description)}</p>` : ''}
<div class="meta">${t.gen} · ${escHtml(date)} · ${t.mode}: ${t[m.mode] || m.mode} · ${t.ratio} ${m.format.ratio} · ${m.format.output.width}×${m.format.output.height}</div>
${videos.length && !args.embed ? `<section class="step"><h2>${t.video}</h2>${videos.map((v) => `<video controls preload="metadata" src="${v.video}">${v.srt ? `<track kind="subtitles" src="${v.srt.replace('.srt', '.vtt')}" default>` : ''}</video><div class="url">${v.video} · ${v.ratio}</div>`).join('')}</section>` : ''}
${isTest ? `<section class="step"><h2>${t.result} — ${m.summary.ok}/${m.summary.total}</h2><table><tr><th>#</th><th>${t.step}</th><th>${t.status}</th><th>${t.error}</th></tr>${m.steps.map((s) => `<tr><td>${s.index}</td><td>${escHtml(s.title)}</td><td class="${s.status === 'ok' ? 'ok' : 'bad'}">${s.status === 'ok' ? t.ok : t.failed}</td><td>${escHtml(s.error || '')}</td></tr>`).join('')}</table></section>` : ''}
${m.steps.map((s) => `<section class="step" id="${s.id}"><h2><span class="num">${s.index}</span>${escHtml(s.title)}${s.status !== 'ok' ? `<span class="badge bad">${t.failed}</span>` : ''}</h2>
${s.description ? `<p>${escHtml(s.description)}</p>` : ''}
${s.screenshot ? `<figure><img loading="lazy" src="${img(s.screenshot)}" alt="${escHtml(s.title)}"></figure>` : ''}
${s.error ? `<p class="err">⚠️ ${escHtml(s.error)}</p>` : ''}</section>`).join('\n')}
</main></div></body></html>`;
fs.writeFileSync(path.join(dir, 'DOKUMENTASI.html'), html);

// SRT → VTT untuk pemutar HTML
for (const v of videos) {
  const srt = path.join(dir, v.srt || '');
  if (v.srt && fs.existsSync(srt)) fs.writeFileSync(srt.replace(/\.srt$/, '.vtt'), 'WEBVTT\n\n' + fs.readFileSync(srt, 'utf8').replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2'));
}
console.log(`Dokumentasi: ${path.join(dir, 'DOKUMENTASI.docx')}\n             ${path.join(dir, 'DOKUMENTASI.html')}`);
