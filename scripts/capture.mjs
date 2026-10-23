#!/usr/bin/env node
/**
 * capture.mjs — jalankan alur (flow) aplikasi web, ambil screenshot tiap halaman/langkah,
 * rekam video, dan tulis manifest.json yang dipakai build-docs.mjs & make-video.mjs.
 *
 * Pemakaian:
 *   node scripts/capture.mjs --flow flows/app.json [--ratio 9:16] [--mode demo|test]
 *        [--out output/app] [--no-video] [--headed] [--crawl]
 *
 * Tidak bergantung pada AI tertentu: Claude, Codex, Gemini, atau manusia bisa menjalankannya.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// ---------- Playwright (lokal, lalu global) ----------
function loadPlaywright() {
  const tries = [
    () => require('playwright'),
    () => require(path.join(execSyncSafe('npm root -g'), 'playwright')),
  ];
  for (const t of tries) { try { return t(); } catch { /* next */ } }
  console.error('Playwright tidak ditemukan. Jalankan: npm install && npx playwright install chromium');
  process.exit(1);
}
function execSyncSafe(cmd) {
  try { return require('node:child_process').execSync(cmd, { encoding: 'utf8' }).trim(); } catch { return ''; }
}

// ---------- Argumen ----------
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) { a._.push(k); continue; }
    const key = k.slice(2);
    if (key.startsWith('no-')) { a[key.slice(3)] = false; continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) a[key] = true;
    else { a[key] = next; i++; }
  }
  return a;
}

// ---------- .env sederhana & substitusi ${env:NAMA} ----------
function loadDotEnv(dir) {
  const f = path.join(dir, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
function subst(v) {
  if (typeof v === 'string') {
    return v.replace(/\$\{env:([A-Za-z0-9_]+)\}/g, (_, n) => {
      if (process.env[n] === undefined) throw new Error(`Variabel lingkungan ${n} belum diisi (.env atau export)`);
      return process.env[n];
    });
  }
  if (Array.isArray(v)) return v.map(subst);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, subst(x)]));
  return v;
}

// ---------- Deteksi URL aplikasi (flow tanpa baseUrl, dijalankan dari folder aplikasi) ----------
// ponytail: cek kandidat umum berurutan; tambah kandidat bila ada framework lain
async function detectBaseUrl() {
  const cands = [
    process.env.APP_URL,                                         // Laravel / umum di .env
    `http://${path.basename(process.cwd()).toLowerCase()}.test`, // Laravel Herd / Valet
    'http://127.0.0.1:8000',                                     // php artisan serve, Django
    'http://localhost:3000', 'http://localhost:5173',            // Next/Express, Vite
    'http://localhost:8080', 'http://localhost:4200',            // Vue CLI/Flutter web, Angular
  ].filter(Boolean);
  for (const u of [...new Set(cands)]) {
    try {
      await fetch(u, { signal: AbortSignal.timeout(1500), redirect: 'manual' });
      console.log(`URL aplikasi terdeteksi otomatis: ${u}`);
      return u.replace(/\/?$/, '/');
    } catch {}
  }
  throw new Error(`Aplikasi tidak ditemukan berjalan (dicek: ${cands.join(', ')}). Jalankan server dev-nya (mis. php artisan serve / npm run dev) atau isi "baseUrl" di flow.`);
}

// ---------- Rasio & ukuran ----------
const PRESETS = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'presets.json'), 'utf8'));
const even = (n) => Math.max(2, Math.round(n / 2) * 2);

export function resolveFormat(fmt = {}, cli = {}) {
  let f = { ...fmt };
  const presetName = cli.preset || f.preset;
  if (presetName) {
    const p = PRESETS[presetName];
    if (!p) throw new Error(`Preset "${presetName}" tidak ada. Pilihan: ${Object.keys(PRESETS).join(', ')}`);
    f = { ...p, ...f, preset: presetName };
  }
  if (cli.ratio && !cli.preset) {
    // rasio dari CLI menimpa preset di flow → ukuran dihitung ulang dari rasio baru
    const keep = f.ratio === cli.ratio;
    f.ratio = cli.ratio;
    if (!keep) { delete f.viewportWidth; delete f.outputWidth; delete f.mobile; delete f.device; }
  }
  if (cli.width) f.outputWidth = Number(cli.width);
  if (cli.viewport) f.viewportWidth = Number(cli.viewport);
  const ratio = String(f.ratio || '16:9');
  const [rw, rh] = ratio.split(/[:x/]/).map(Number);
  if (!rw || !rh) throw new Error(`Rasio tidak valid: ${ratio} (contoh: 16:9, 9:16, 1:1, 4:5)`);
  const r = rw / rh;
  const portrait = r < 1;
  const viewportWidth = Number(f.viewportWidth || (portrait ? 390 : 1280));
  const outputWidth = Number(f.outputWidth || (portrait ? 1080 : 1920));
  const viewportHeight = Math.round(viewportWidth / r);
  return {
    preset: f.preset || null,
    ratio,
    viewport: { width: viewportWidth, height: viewportHeight },
    deviceScaleFactor: +(outputWidth / viewportWidth).toFixed(4),
    output: { width: even(outputWidth), height: even(outputWidth / r) },
    mobile: f.mobile ?? portrait,
    device: f.device || null,
    fps: Number(f.fps || 30),
  };
}

// ---------- Overlay (kursor, ripple klik, caption, highlight) ----------
const OVERLAY_SCRIPT = `(() => {
  if (window.__dr) return; window.__dr = true;
  const css = \`
  #__dr_cursor{position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
    background:rgba(255,200,0,.55);border:2px solid rgba(0,0,0,.6);z-index:2147483647;pointer-events:none;
    transition:transform .04s linear;box-shadow:0 0 0 4px rgba(255,200,0,.18)}
  .__dr_ripple{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #ffb400;
    z-index:2147483646;pointer-events:none;animation:__dr_r .55s ease-out forwards}
  @keyframes __dr_r{to{transform:scale(4);opacity:0}}
  #__dr_caption{position:fixed;left:50%;bottom:4%;transform:translateX(-50%);max-width:88%;padding:.6em 1em;
    background:rgba(15,15,20,.85);color:#fff;font:600 clamp(14px,2.4vmin,26px)/1.35 system-ui,sans-serif;
    border-radius:10px;z-index:2147483645;pointer-events:none;text-align:center;transition:opacity .25s}
  .__dr_hl{outline:3px solid #ff3b30 !important;outline-offset:3px !important;border-radius:4px}
  #__dr_cursor.arrow{width:20px;height:30px;margin:-2px 0 0 -2px;border:0;border-radius:0;background:none;box-shadow:none;
    filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.35))}
  #__dr_cursor.text{width:12px;height:24px;margin:-12px 0 0 -6px;border:0;border-radius:0;background:none;box-shadow:none}
  html.__dr_clean #__dr_cursor, html.__dr_clean #__dr_caption, html.__dr_clean .__dr_ripple{display:none !important}\`;
  const boot = () => {
    const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st);
    const c = document.createElement('div'); c.id = '__dr_cursor'; document.documentElement.appendChild(c);
    // desktop: panah ala macOS (ujung panah = posisi mouse), berubah jadi I-beam di atas kolom teks; HP: lingkaran sentuhan
    const ARROW = '<svg width="20" height="30" viewBox="0 0 20 30"><path d="M2 2v22.5l5.3-5.1 4 9.3 3.7-1.6-4-9.1H18Z" fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const IBEAM = '<svg width="12" height="24" viewBox="0 0 12 24"><path d="M2.5 2.5c2 0 3.5.6 3.5 2v15c0 1.4-1.5 2-3.5 2M9.5 2.5c-2 0-3.5.6-3.5 2v15c0 1.4 1.5 2 3.5 2M3.5 12h5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><path d="M2.5 2.5c2 0 3.5.6 3.5 2v15c0 1.4-1.5 2-3.5 2M9.5 2.5c-2 0-3.5.6-3.5 2v15c0 1.4 1.5 2 3.5 2M3.5 12h5" fill="none" stroke="#000" stroke-width="1.4" stroke-linecap="round"/></svg>';
    const isText = (el) => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' ||
      (el.tagName === 'INPUT' && !/^(button|submit|reset|checkbox|radio|range|color|file|image)$/i.test(el.type)));
    let shape = '';
    const setShape = (s) => { if (s === shape) return; shape = s; c.className = s; c.innerHTML = s === 'text' ? IBEAM : ARROW; };
    if (window.__drArrow) {
      setShape('arrow');
      addEventListener('mousemove', (e) => setShape(isText(e.target) ? 'text' : 'arrow'), true);
    }
    if (window.__drCursorOff) c.style.display = 'none';
    const pos = window.__drPos || {x:-50,y:-50};
    c.style.transform = 'translate(' + pos.x + 'px,' + pos.y + 'px)';
    addEventListener('mousemove', e => { c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, true);
    addEventListener('mousedown', e => {
      const r = document.createElement('div'); r.className = '__dr_ripple';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.documentElement.appendChild(r); setTimeout(() => r.remove(), 600);
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.__drCaption = (t) => {
    let el = document.getElementById('__dr_caption');
    if (!t) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = '__dr_caption'; document.documentElement.appendChild(el); }
    el.textContent = t;
  };
})();`;

// Elemen yang selalu disembunyikan: toolbar dev & banner cookie umum (matikan dengan "hideDefaults": false)
const HIDE_DEFAULTS = [
  '.phpdebugbar', '#phpdebugbar', '.clockwork-toolbar',            // Laravel Debugbar / Clockwork
  'vite-error-overlay', 'nextjs-portal', '#nuxt-devtools-container', // overlay dev Vite / Next / Nuxt
  '#webpack-dev-server-client-overlay', '#vue-devtools-anchor',
  '#onetrust-banner-sdk', '#CybotCookiebotDialog', '.cc-window', '.cookie-consent', '#cookie-consent', // banner cookie
];

// ---------- Crawl halaman (opsional) ----------
async function discoverPages(page, baseUrl, { maxPages = 30, exclude = [] }) {
  const origin = new URL(baseUrl).origin;
  const ex = [/logout|signout|keluar|delete|hapus|destroy/i, ...exclude.map((e) => new RegExp(e, 'i'))];
  const seen = new Set(); const queue = [baseUrl]; const out = [];
  while (queue.length && out.length < maxPages) {
    const url = queue.shift().split('#')[0];
    const norm = (u) => u.replace(/\/(index\.(html?|php))?$/i, '/').replace(/\/$/, '');
    if (seen.has(norm(url))) continue; seen.add(norm(url));
    if (ex.some((r) => r.test(url))) continue;
    try { await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }); } catch { continue; }
    if (out.some((o) => norm(o.url) === norm(page.url()))) continue;
    seen.add(norm(page.url()));
    out.push({ url: page.url(), title: (await page.title()) || url });
    const links = await page.$$eval('a[href]', (as) => as.map((a) => a.href));
    for (const l of links) {
      try { const u = new URL(l); if (u.origin === origin && !seen.has(norm(u.href.split('#')[0]))) queue.push(u.href); } catch {}
    }
  }
  return out;
}

// ---------- Eksekusi aksi ----------
function slug(s, i) {
  const b = String(s || 'langkah').toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${String(i).padStart(2, '0')}-${b || 'langkah'}`;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.flow) {
    console.log('Pemakaian: node scripts/capture.mjs --flow <flow.json> [--ratio 9:16|--preset reels] [--mode demo|test] [--out dir] [--no-video] [--headed] [--crawl]');
    process.exit(1);
  }
  const flowPath = path.resolve(args.flow);
  loadDotEnv(process.cwd()); loadDotEnv(path.dirname(flowPath));
  const raw = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
  const flow = subst(raw);
  if (!flow.baseUrl) flow.baseUrl = await detectBaseUrl();
  if (args.captions === 'none' || args.captions === false) flow.captions = false;
  const mode = args.mode || flow.mode || 'demo';
  const fmt = resolveFormat(flow.format, args);
  const timing = { typeDelay: 55, moveSteps: 22, pauseAfterAction: 700, pauseAfterStep: 1400, ...(flow.timing || {}) };
  if (mode === 'test') Object.assign(timing, { typeDelay: 0, moveSteps: 1, pauseAfterAction: 100, pauseAfterStep: 200 });
  const ratioTag = fmt.ratio.replace(/[:/]/g, 'x');
  const outDir = path.resolve(args.out || path.join('output', (flow.name || 'app').replace(/\s+/g, '-').toLowerCase(), `${mode}-${ratioTag}`));
  const shotsDir = path.join(outDir, 'screenshots');
  fs.mkdirSync(shotsDir, { recursive: true });
  const recordVideo = args.video !== false && flow.video !== false;
  // supersampling: mode demo direkam 2x resolusi output agar tetap tajam saat auto-zoom (flow "supersample": 1 untuk mematikan)
  const ss = mode === 'demo' && recordVideo ? Math.max(1, Number(flow.supersample ?? 2)) : 1;
  const rec = { width: fmt.output.width * ss, height: fmt.output.height * ss };

  const { chromium, devices } = loadPlaywright();
  const browser = await chromium.launch({ headless: !args.headed, args: ['--disable-dev-shm-usage'] });
  let ctxOpts = {
    viewport: fmt.viewport,
    deviceScaleFactor: fmt.deviceScaleFactor * ss,
    isMobile: !!fmt.mobile,
    hasTouch: !!fmt.mobile,
    locale: flow.locale || 'id-ID',
    timezoneId: flow.timezone || 'Asia/Jakarta',
    colorScheme: flow.colorScheme || 'light',
    ignoreHTTPSErrors: !!flow.ignoreHTTPSErrors,
  };
  if (fmt.device && devices[fmt.device]) ctxOpts = { ...devices[fmt.device], ...ctxOpts, viewport: fmt.viewport, deviceScaleFactor: fmt.deviceScaleFactor * ss };
  if (flow.storageState && fs.existsSync(path.resolve(path.dirname(flowPath), flow.storageState))) {
    ctxOpts.storageState = path.resolve(path.dirname(flowPath), flow.storageState);
  }
  if (flow.httpCredentials) ctxOpts.httpCredentials = flow.httpCredentials;

  const context = await browser.newContext(ctxOpts);
  const tCtx = Date.now();
  const showOverlay = mode === 'demo' && flow.overlay !== false;
  if (showOverlay) {
    if (!fmt.mobile) await context.addInitScript(() => { window.__drArrow = true; });
    await context.addInitScript(OVERLAY_SCRIPT);
  }
  // sembunyikan gangguan (debugbar, banner cookie, overlay dev) + blur data pribadi; aktif di video & screenshot
  const hide = [...(flow.hideDefaults === false ? [] : HIDE_DEFAULTS), ...(flow.hide || [])];
  const blur = flow.mask || [];
  const cleanCss = (hide.length ? `${hide.join(',')}{display:none !important}` : '') +
    (blur.length ? `${blur.join(',')}{filter:blur(7px) !important;user-select:none}` : '');
  if (cleanCss) await context.addInitScript((css) => {
    const add = () => { const s = document.createElement('style'); s.textContent = css; document.documentElement.appendChild(s); };
    if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add);
  }, cleanCss);
  const page = await context.newPage();

  // ---------- Perekam video: screencast CDP pada resolusi device pixel (tajam di semua rasio) ----------
  const frames = [];
  const framesDir = path.join(outDir, '.frames');
  let cdp = null;
  if (recordVideo) {
    fs.rmSync(framesDir, { recursive: true, force: true }); fs.mkdirSync(framesDir, { recursive: true });
    cdp = await context.newCDPSession(page);
    cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
      const f = path.join(framesDir, `${String(frames.length).padStart(6, '0')}.jpg`);
      fs.writeFileSync(f, Buffer.from(data, 'base64'));
      frames.push({ f, t: Date.now() });
      cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: Number(flow.videoQuality || 95),
      maxWidth: rec.width, maxHeight: rec.height, everyNthFrame: 1 });
  }
  page.setDefaultTimeout(Number(flow.timeout || 15000));
  const base = flow.baseUrl || '';
  const toUrl = (u) => (/^(https?|file):/.test(u) ? u : new URL(u, base).href);

  let mouse = { x: fmt.viewport.width / 2, y: fmt.viewport.height / 2 };
  const sleep = (ms) => page.waitForTimeout(ms);
  const clicks = []; // waktu klik → efek suara di make-video (--sfx)
  // caption di halaman (hanya dengan --page-captions); di video cukup subtitle narasi
  const caption = async (t) => {
    if (showOverlay && flow.captions !== false) await page.evaluate((x) => window.__drCaption && window.__drCaption(x), t || '').catch(() => {}); };

  async function moveTo(locator) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) return;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    if (mode === 'demo') await page.mouse.move(x, y, { steps: timing.moveSteps });
    mouse = { x, y };
    await page.evaluate((p) => { window.__drPos = p; }, mouse).catch(() => {});
    // titik fokus zoom: tengah elemen, tapi untuk elemen besar pakai posisi kursor
    lastFocus = { x: x / fmt.viewport.width, y: y / fmt.viewport.height,
      w: box.width / fmt.viewport.width, h: box.height / fmt.viewport.height };
  }

  // ---------- Auto-zoom: catat interaksi penting untuk make-video ----------
  const zoomCfg = { enabled: true, level: 1.8, actions: ['click', 'dblclick', 'fill', 'type', 'select', 'check', 'uncheck', 'upload', 'focus'], ...(flow.zoom || {}) };
  if (flow.zoom === false) zoomCfg.enabled = false;
  const zoomEvents = [];
  let lastFocus = null;
  let stepZoom = undefined;

  async function doAction(act) {
    const [type] = Object.keys(act).filter((k) => !['value', 'options', 'caption', 'nth', 'zoom', 'duration'].includes(k));
    const sel = act[type];
    const loc = () => { const l = page.locator(sel); return act.nth !== undefined ? l.nth(act.nth) : l.first(); };
    if (act.caption) await caption(act.caption);
    const zStart = Date.now();
    lastFocus = null;
    const urlBefore = page.url();
    const focusBefore = lastFocus;
    await doActionInner(type, sel, act, loc);
    let zEnd = Date.now();
    // klik yang mengganti tampilan/halaman → zoom keluar segera (jangan tahan di posisi tombol lama)
    let changed = false;
    if (['click', 'dblclick'].includes(type) && lastFocus) {
      await sleep(250);
      changed = page.url() !== urlBefore || !(await loc().isVisible().catch(() => false));
      zEnd = Date.now();
    }
    if (!['wait', 'expectText', 'expectUrl', 'expectVisible', 'saveSession'].includes(type)) await sleep(timing.pauseAfterAction);
    const wantZoom = act.zoom ?? stepZoom;
    if (zoomCfg.enabled && lastFocus && wantZoom !== false && (zoomCfg.actions.includes(type) || wantZoom)) {
      // level otomatis: elemen besar (mis. tabel/kartu) di-zoom lebih sedikit agar tetap utuh terlihat
      let level = typeof wantZoom === 'number' ? wantZoom : zoomCfg.level;
      const fitLevel = 0.9 / Math.max(lastFocus.w, lastFocus.h, 0.01);
      if (typeof wantZoom !== 'number') level = Math.max(1.15, Math.min(level, fitLevel));
      zoomEvents.push({ type, step: i, start: zStart, end: zEnd, cut: changed, x: +lastFocus.x.toFixed(4), y: +lastFocus.y.toFixed(4), level: +level.toFixed(3) });
    }
  }

  async function doActionInner(type, sel, act, loc) {
    switch (type) {
      case 'focus': // sorot area penting tanpa klik: kursor ke elemen + zoom, tahan selama duration ms
        await moveTo(loc()); await sleep(Number(act.duration || 1800)); break;
      case 'goto': await page.goto(toUrl(sel), { waitUntil: 'networkidle' }).catch(async () => page.waitForLoadState('load'));
        await page.mouse.move(mouse.x, mouse.y).catch(() => {}); break;
      case 'click': await moveTo(loc()); clicks.push(Date.now()); await loc().click(act.options); break;
      case 'dblclick': await moveTo(loc()); clicks.push(Date.now()); await loc().dblclick(); break;
      case 'hover': await moveTo(loc()); await loc().hover(); break;
      case 'fill': await moveTo(loc()); clicks.push(Date.now()); await loc().click();
        if (mode === 'demo') { await loc().fill(''); await loc().pressSequentially(String(act.value ?? ''), { delay: timing.typeDelay }); }
        else await loc().fill(String(act.value ?? '')); break;
      case 'type': await loc().pressSequentially(String(act.value ?? ''), { delay: timing.typeDelay }); break;
      case 'press': if (sel === true || sel === 'page') await page.keyboard.press(act.value); else await loc().press(act.value); break;
      case 'select': await moveTo(loc()); await loc().selectOption(act.value); break;
      case 'check': await moveTo(loc()); await loc().check(); break;
      case 'uncheck': await moveTo(loc()); await loc().uncheck(); break;
      case 'upload': await loc().setInputFiles(path.resolve(path.dirname(flowPath), act.value)); break;
      case 'scroll':
        if (typeof sel === 'number') await page.mouse.wheel(0, sel);
        else await loc().scrollIntoViewIfNeeded();
        break;
      case 'wait': await sleep(Number(sel)); break;
      case 'waitFor': await loc().waitFor({ state: 'visible' }).catch(() => { throw new Error(`Menunggu ${sel} terlalu lama`); }); break;
      case 'waitForUrl': await page.waitForURL(new RegExp(sel)); break;
      case 'expectText': await page.getByText(sel, { exact: false }).first().waitFor({ state: 'visible' })
        .catch(() => { throw new Error(`Teks "${sel}" tidak muncul di halaman`); }); break;
      case 'expectUrl': if (!new RegExp(sel).test(page.url())) throw new Error(`URL ${page.url()} tidak cocok /${sel}/`); break;
      case 'expectVisible': await loc().waitFor({ state: 'visible' }).catch(() => { throw new Error(`Elemen ${sel} tidak terlihat`); }); break;
      case 'eval': await page.evaluate(sel); break;
      case 'saveSession': await context.storageState({ path: path.resolve(path.dirname(flowPath), sel) }); break;
      default: throw new Error(`Aksi tidak dikenal: ${type}`);
    }

  }

  async function shoot(step, name) {
    const file = path.join(shotsDir, `${name}.png`);
    const hl = step.highlight ? page.locator(step.highlight).first() : null;
    if (hl) await hl.evaluate((el) => el.classList.add('__dr_hl')).catch(() => {});
    if (showOverlay && flow.cleanScreenshots !== false) await page.evaluate(() => document.documentElement.classList.add('__dr_clean')).catch(() => {});
    const opts = { path: file, fullPage: !!(step.fullPage ?? flow.fullPage) };
    if (step.element) await page.locator(step.element).first().screenshot({ path: file });
    else await page.screenshot(opts);
    await page.evaluate(() => document.documentElement.classList.remove('__dr_clean')).catch(() => {});
    if (hl) await hl.evaluate((el) => el.classList.remove('__dr_hl')).catch(() => {});
    return path.relative(outDir, file).split(path.sep).join('/');
  }

  // Susun langkah: dari flow.steps, flow.pages, atau crawl
  let steps = flow.steps || [];
  if (flow.pages) steps = steps.concat(flow.pages.map((p) => ({ title: p.title || p.path, description: p.description, url: p.path || p.url, actions: p.actions || [] })));
  if (args.crawl || flow.crawl) {
    const found = await discoverPages(page, toUrl(flow.crawl?.start || '/'), flow.crawl || {});
    console.log(`Crawl menemukan ${found.length} halaman`);
    if (!found.length) throw new Error('Crawl tidak menemukan halaman. Cek baseUrl, koneksi, atau perlu login dulu (storageState).');
    steps = steps.concat(found.map((f) => ({ title: f.title, url: f.url, actions: [] })));
  }
  if (!steps.length) throw new Error('Flow tidak punya steps/pages. Lihat examples/flow.example.json');

  const manifest = {
    name: flow.name || 'Aplikasi', description: flow.description || '', version: flow.version || '',
    brand: flow.brand ? { color: flow.brand.color || null, logo: flow.brand.logo ? path.resolve(path.dirname(flowPath), flow.brand.logo) : null } : null,
    lang: flow.lang || 'id', mode, format: { ...fmt, record: rec }, generatedAt: new Date().toISOString(),
    videoStartOffsetMs: 0, steps: [], video: null, summary: {},
  };
  let firstNavAt = null;
  page.on('framenavigated', (f) => { if (f === page.mainFrame() && firstNavAt === null && page.url() !== 'about:blank') firstNavAt = Date.now(); });

  let i = 0; let failed = 0;
  for (const step of steps) {
    i++;
    const name = slug(step.title, i);
    const rec = { index: i, id: name, title: step.title || `Langkah ${i}`, description: step.description || '', narration: step.narration || '', startMs: 0, endMs: 0, status: 'ok', screenshot: null, error: null };
    const t0 = Date.now();
    process.stdout.write(`[${i}/${steps.length}] ${rec.title} ... `);
    try {
      stepZoom = step.zoom;
      if (step.url) await doAction({ goto: step.url });
      if (step.caption || step.title) await caption(step.caption || step.title);
      for (const act of step.actions || []) await doAction(act);
      if (step.screenshot !== false) rec.screenshot = await shoot(step, name);
      await sleep(timing.pauseAfterStep);
      // demo: tahan langkah sampai naskah narasi sempat dibacakan (±2,5 kata/detik)
      const words = (rec.narration || rec.description || rec.title).split(/\s+/).filter(Boolean).length;
      // hitung dari frame video pertama (screencast baru mulai ±2 dtk setelah halaman dibuka)
      const seenFrom = Math.max(t0, frames[0]?.t ?? t0, (firstNavAt || 0) + 100);
      if (mode === 'demo') await sleep(Math.max(0, words / 2.5 * 1000 + 400 - (Date.now() - seenFrom)));
      console.log('ok');
    } catch (e) {
      rec.status = 'failed'; rec.error = String(e.message || e).split('\n')[0]; failed++;
      if (base) rec.error = rec.error.replaceAll(base.replace(/\/$/, ''), ''); // URL aplikasi tidak ikut ke output
      console.log('GAGAL: ' + rec.error);
      try { rec.screenshot = await shoot({}, name + '-error'); } catch {}
      if (mode === 'test' && flow.stopOnFail) { rec.endMs = Date.now(); manifest.steps.push(rec); break; }
    }
    rec.startMs = t0; rec.endMs = Date.now();
    manifest.steps.push(rec);
  }
  await caption('');

  const tStop = Date.now();
  if (cdp) { await page.waitForTimeout(300); await cdp.send('Page.stopScreencast').catch(() => {}); }
  await context.close();
  await browser.close();

  // Waktu relatif terhadap awal video (frame pertama setelah halaman pertama dimuat)
  const startFrame = frames.findIndex((fr) => firstNavAt && fr.t >= firstNavAt + 100);
  const T0 = startFrame >= 0 ? frames[startFrame].t : (firstNavAt || tCtx);
  const offset = T0 - tCtx;
  manifest.videoStartOffsetMs = 0;
  manifest.zoom = { ...zoomCfg, enabled: zoomCfg.enabled && mode === 'demo' };
  manifest.clicks = clicks.map((c) => Math.max(0, c - tCtx - offset));
  manifest.zoomEvents = zoomEvents.map((z) => ({ ...z, start: Math.max(0, z.start - tCtx - offset), end: Math.max(0, z.end - tCtx - offset) }));
  for (const s of manifest.steps) { s.startMs = Math.max(0, s.startMs - tCtx - offset); s.endMs = Math.max(s.startMs, s.endMs - tCtx - offset); }
  if (recordVideo && frames.length) {
    // frame screencast hanya dikirim saat layar berubah → susun jadi video fps konstan via ffconcat
    const used = frames.slice(Math.max(0, startFrame));
    const list = ['ffconcat version 1.0'];
    used.forEach((fr, k) => {
      const next = used[k + 1] ? used[k + 1].t : tStop + 500;
      list.push(`file '${fr.f.replace(/'/g, "'\\''")}'`, `duration ${Math.max(0.001, (next - fr.t) / 1000).toFixed(3)}`);
    });
    list.push(`file '${used[used.length - 1].f}'`);
    const listFile = path.join(framesDir, 'list.ffconcat');
    fs.writeFileSync(listFile, list.join('\n'));
    const { spawnSync } = await import('node:child_process');
    const W = rec.width, H = rec.height;
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=white,fps=${fmt.fps},format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', path.join(outDir, 'video-raw.mp4')], { stdio: 'inherit' });
    if (r.status === 0) { manifest.video = 'video-raw.mp4'; if (!flow.keepFrames) fs.rmSync(framesDir, { recursive: true, force: true }); }
    else console.error('Gagal menyusun video (ffmpeg terpasang?). Frame mentah disimpan di', framesDir);
  }
  manifest.summary = { total: manifest.steps.length, ok: manifest.steps.length - failed, failed };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nSelesai: ${manifest.summary.ok}/${manifest.summary.total} langkah ok → ${outDir}`);
  console.log(`Ukuran output ${fmt.output.width}x${fmt.output.height} (rasio ${fmt.ratio}, viewport ${fmt.viewport.width}x${fmt.viewport.height})`);
  if (failed && mode === 'test') process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('capture.mjs')) {
  run().catch((e) => { console.error('Error:', e.message); process.exit(1); });
}
