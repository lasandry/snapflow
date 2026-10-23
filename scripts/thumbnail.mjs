/**
 * thumbnail.mjs — buat thumbnail video (YouTube 16:9 / Reels-TikTok 9:16) dari HTML, dirender Chromium (Playwright).
 * Desain: latar warna brand bergradasi, label + judul besar, screenshot aplikasi dalam bingkai jendela browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dataUrl = (file) => `data:image/${path.extname(file).slice(1).toLowerCase().replace('jpg', 'jpeg')};base64,${fs.readFileSync(file).toString('base64')}`;

/**
 * @param {object} o
 * @param {string} o.shot   screenshot aplikasi (png)
 * @param {string} o.title  judul besar
 * @param {string} o.label  label kecil di atas judul (mis. "TUTORIAL")
 * @param {string} o.meta   keterangan kecil di bawah judul (mis. "10 langkah mudah")
 * @param {string} o.app    nama aplikasi
 * @param {string} o.color  warna brand tanpa '#'
 * @param {boolean} o.light true bila warna brand terang (teks jadi gelap)
 * @param {string|null} o.logo  file logo (opsional)
 * @param {boolean} o.portrait  true untuk 9:16
 * @param {string} o.out    file jpg hasil
 */
export async function makeThumbnail(o) {
  const [W, H] = o.portrait ? [1080, 1920] : [1280, 720];
  const ink = o.light ? '#141413' : '#ffffff';
  const mark = o.logo ? `<img src="${dataUrl(o.logo)}">` : `<b>${esc(o.app.trim()[0] || 'A')}</b>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;overflow:hidden;font-family:"Segoe UI",Inter,"Helvetica Neue",Arial,sans-serif;color:${ink};
  background:radial-gradient(120% 90% at 0% 0%,color-mix(in srgb,#${o.color} 80%,white) 0%,#${o.color} 45%,color-mix(in srgb,#${o.color} 55%,black) 100%)}
.dots{position:absolute;inset:0;background-image:radial-gradient(color-mix(in srgb,${ink} 14%,transparent) 1.4px,transparent 1.6px);background-size:26px 26px;
  -webkit-mask-image:linear-gradient(${o.portrait ? '180deg' : '90deg'},#000,transparent 70%)}
.text{position:absolute;${o.portrait ? 'left:80px;right:80px;top:120px' : 'left:70px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center'}}
.app{display:flex;align-items:center;gap:14px;font-size:${o.portrait ? 38 : 26}px;font-weight:700;margin-bottom:${o.portrait ? 48 : 30}px;opacity:.95}
.app span{width:${o.portrait ? 64 : 46}px;height:${o.portrait ? 64 : 46}px;border-radius:12px;background:${ink};display:grid;place-items:center;overflow:hidden}
.app span b{color:#${o.color};font-size:${o.portrait ? 36 : 26}px}.app span img{width:100%;height:100%;object-fit:contain;background:#fff}
.label{display:inline-block;background:${ink};color:#${o.color};font-weight:800;letter-spacing:.12em;font-size:${o.portrait ? 30 : 20}px;padding:8px 16px;border-radius:8px;margin-bottom:${o.portrait ? 30 : 22}px}
h1{font-size:${o.portrait ? 112 : 70}px;line-height:1.02;font-weight:900;letter-spacing:-.02em;text-wrap:balance;text-shadow:0 4px 24px rgba(0,0,0,.18)}
.meta{margin-top:${o.portrait ? 34 : 24}px;font-size:${o.portrait ? 40 : 26}px;font-weight:600;opacity:.9}
.win{position:absolute;${o.portrait ? 'left:90px;right:-160px;top:760px;bottom:-80px' : 'left:640px;right:-150px;top:70px;bottom:-40px'};
  border-radius:18px;background:#fff;overflow:hidden;box-shadow:0 40px 80px rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.08);
  transform:perspective(2000px) rotateY(${o.portrait ? -8 : -14}deg) rotateX(4deg) rotateZ(${o.portrait ? -2 : 1}deg);transform-origin:left center}
.bar{height:${o.portrait ? 48 : 38}px;background:#f2f1ed;display:flex;align-items:center;gap:9px;padding:0 16px;border-bottom:1px solid #e5e3da}
.bar i{width:13px;height:13px;border-radius:50%;background:#ff5f57}.bar i+i{background:#febc2e}.bar i+i+i{background:#28c840}
.shot{width:100%;height:calc(100% - ${o.portrait ? 48 : 38}px);object-fit:cover;object-position:top left;display:block}
</style></head><body><div class="dots"></div>
<div class="win"><div class="bar"><i></i><i></i><i></i></div><img class="shot" src="${dataUrl(o.shot)}"></div>
<div class="text"><div class="app"><span>${mark}</span>${esc(o.app)}</div>
  <div><span class="label">${esc(o.label)}</span></div><h1>${esc(o.title)}</h1>${o.meta ? `<div class="meta">${esc(o.meta)}</div>` : ''}</div>
</body></html>`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: o.out, type: 'jpeg', quality: 92 });
  } finally { await browser.close(); }
}
