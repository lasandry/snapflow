#!/usr/bin/env node
/**
 * make-music.mjs — buat musik latar instrumental dari nol (sintesis, bebas royalti) sepanjang video.
 * Dipanggil otomatis oleh make-video.mjs (--music lofi|corporate); bisa juga manual:
 *
 *   node scripts/make-music.mjs lofi 45 musik.mp3
 *
 * Gaya: lofi (santai 80 BPM, untuk tutorial/dokumentasi) · corporate (ceria 108 BPM, untuk demo/promo/Reels)
 */
// Ekor nada dibungkus ke awal (indeks modulo) sehingga musik juga mulus bila diulang.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

function render(o) {
  const beat = 60 / o.bpm, n = Math.round(o.bars * 4 * beat * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const put = (i, v, pan) => { const k = ((i % n) + n) % n; L[k] += v * (1 - pan); R[k] += v * (1 + pan); };

  const keys = (t0, midi, dur, vel, pan = 0, bright = 1, decay = 2.2) => {
    const f = mtof(midi), s = Math.round(t0 * SR), len = Math.round((dur + 1.5) * SR);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const env = Math.min(1, t / 0.006) * Math.exp(-t * decay) * (t < dur ? 1 : Math.exp(-(t - dur) * 7));
      const w = 2 * Math.PI * f * t;
      const v = Math.sin(w + 0.6 * bright * Math.exp(-t * 5) * Math.sin(w)) + 0.25 * bright * Math.sin(2 * w) * Math.exp(-t * 4);
      put(s + i, v * env * vel, pan);
    }
  };
  const bass = (t0, midi, dur, vel) => {
    const f = mtof(midi), s = Math.round(t0 * SR), len = Math.round((dur + 0.3) * SR);
    for (let i = 0; i < len; i++) {
      const t = i / SR, env = Math.min(1, t / 0.008) * (t < dur ? Math.exp(-t * 1.2) : Math.exp(-dur * 1.2) * Math.exp(-(t - dur) * 20));
      put(s + i, (Math.sin(2 * Math.PI * f * t) + 0.15 * Math.sin(4 * Math.PI * f * t)) * env * vel, 0);
    }
  };
  const kick = (t0, vel) => {
    const s = Math.round(t0 * SR); let ph = 0;
    for (let i = 0; i < 0.4 * SR; i++) { const t = i / SR; ph += 2 * Math.PI * (45 + 75 * Math.exp(-t * 35)) / SR; put(s + i, Math.sin(ph) * Math.exp(-t * 9) * vel, 0); }
  };
  const snare = (t0, vel, tone = 190) => {
    const s = Math.round(t0 * SR); let lp = 0;
    for (let i = 0; i < 0.3 * SR; i++) { const t = i / SR; lp += 0.35 * ((rnd() * 2 - 1) - lp); put(s + i, (lp * Math.exp(-t * 16) + 0.4 * Math.sin(2 * Math.PI * tone * t) * Math.exp(-t * 25)) * vel, 0.05); }
  };
  const hat = (t0, vel, pan = 0.25) => {
    const s = Math.round(t0 * SR); let prev = 0;
    for (let i = 0; i < 0.08 * SR; i++) { const t = i / SR, x = rnd() * 2 - 1; put(s + i, (x - prev) * Math.exp(-t * 70) * vel, pan); prev = x; }
  };

  for (let bar = 0; bar < o.bars; bar++) {
    const t = bar * 4 * beat, ch = o.prog[bar % o.prog.length], root = o.roots[bar % o.roots.length];
    o.pattern({ t, beat, bar, ch, root, keys, bass, kick, snare, hat });
  }
  if (o.crackle) for (let i = 0; i < n; i++) if (rnd() < 6 / SR) { const a = (rnd() * 0.5 + 0.5) * o.crackle; for (let k = 0; k < 40; k++) put(i + k, a * (rnd() * 2 - 1) * Math.exp(-k / 6), rnd() - 0.5); }

  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(L[i] / peak * 0.85 * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(R[i] / peak * 0.85 * 32767), 46 + i * 4); }
  const wav = o.out.replace(/\.\w+$/, '') + '.tmp.wav';
  fs.writeFileSync(wav, buf);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-af', o.post, '-ar', '44100', '-b:a', '192k', o.out], { stdio: 'inherit' });
  fs.rmSync(wav);
  return r.status === 0;
}

const STYLES = {
  // 1) Lo-fi santai 80 BPM: Fmaj7 – Em7 – Dm7 – Cmaj7, swing, drum lembut, kresek vinyl tipis
  lofi: {
    bpm: 80, crackle: 0.04,
    prog: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], roots: [41, 40, 38, 36],
    pattern: ({ t, beat, ch, root, keys, bass, kick, snare, hat }) => {
      const sw = beat * 0.58; // swing
      ch.forEach((m, k) => keys(t + k * 0.014, m, beat * 2.6, 0.16, (k - 1.5) * 0.15, 0.7));
      ch.forEach((m, k) => keys(t + 2.5 * beat + k * 0.012, m + (k === 3 ? 12 : 0), beat * 1.6, 0.1, (k - 1.5) * 0.15, 0.6));
      bass(t, root, beat * 2.4, 0.4); bass(t + 2.5 * beat, root, beat * 1.4, 0.3);
      kick(t, 0.75); kick(t + 2.5 * beat, 0.55); snare(t + beat, 0.22); snare(t + 3 * beat, 0.22);
      for (let b = 0; b < 4; b++) { hat(t + b * beat, 0.07); hat(t + b * beat + sw, 0.045); }
    },
    post: 'lowpass=f=4800,aecho=0.8:0.55:70|140:0.22|0.12,loudnorm=I=-16:TP=-1.5:LRA=7',
  },

  // 2) Corporate ringan 108 BPM: C – G – Am – F, arpeggio pluck, pad, kick four-on-the-floor lembut
  corporate: {
    bpm: 108,
    prog: [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65]], roots: [36, 43, 45, 41],
    pattern: ({ t, beat, bar, ch, root, keys, bass, kick, snare, hat }) => {
      ch.forEach((m, k) => keys(t + k * 0.01, m - 12, beat * 3.8, 0.07, (k - 1) * 0.3, 0.3, 0.6)); // pad
      const arp = [ch[0], ch[1], ch[2], ch[0] + 12, ch[2], ch[1], ch[0] + 12, ch[2] + 12];
      arp.forEach((m, k) => keys(t + k * beat / 2, m + 12, beat * 0.4, k % 2 ? 0.06 : 0.09, k % 2 ? 0.35 : -0.35, 1, 7));
      for (let b = 0; b < 4; b++) { bass(t + b * beat, root, beat * 0.7, 0.4); kick(t + b * beat, bar < 2 ? 0 : 0.5); hat(t + b * beat + beat / 2, 0.06); }
      if (bar >= 2) { snare(t + beat, 0.16, 230); snare(t + 3 * beat, 0.16, 230); }
    },
    post: 'aecho=0.8:0.5:55|110:0.18|0.1,loudnorm=I=-16:TP=-1.5:LRA=7',
  },
};

/** Buat musik gaya `style` minimal `seconds` detik (dibulatkan ke kelipatan 4 bar) ke file `out` (.mp3). */
export function makeMusic(style, seconds, out) {
  const o = STYLES[style];
  if (!o) throw new Error(`Gaya musik "${style}" tidak ada. Pilihan: ${Object.keys(STYLES).join(', ')}`);
  const barS = 4 * 60 / o.bpm;
  seed = 7;
  return render({ ...o, out, bars: Math.max(4, Math.ceil(seconds / barS / 4) * 4) });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [style = 'lofi', sec = '60', out = `musik-${style}.mp3`] = process.argv.slice(2);
  console.log(makeMusic(style, Number(sec), out) ? `Musik: ${out}` : 'Gagal membuat musik (ffmpeg?)');
}
