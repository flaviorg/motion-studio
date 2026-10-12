#!/usr/bin/env node
// Motion Studio renderer: index.html (window.MOTION / seek / renderAudio contract) -> MP4.
//
// Usage:
//   node render.mjs <project> [--format 16x9,9x16] [--name video] [--fps 30] [--workers 4]
//                             [--from s] [--to s] [--crf 18] [--keep-frames] [--entry index.html]
//   node render.mjs <project> --stills 0.5,2,4.25 [--format 16x9]   (stills + contact sheet only)
//   node render.mjs <project> --every 0.5                            (a still every 0.5 s)
//   node render.mjs <project> --serve [--port 4321]                  (live preview in the browser)
//   node render.mjs <project> --audio-only [--out dir] [--name soundtrack]  (export only the renderAudio WAV)

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';

const FORMATS = { '16x9': [1920, 1080], '9x16': [1080, 1920], '1x1': [1080, 1080], '4x5': [1080, 1350] };
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) { a._.push(k); continue; }
    const key = k.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) a[key] = true;
    else { a[key] = next; i++; }
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
if (!args._[0]) { console.error('Usage: node render.mjs <project-dir> [options]'); process.exit(1); }
const ROOT = path.resolve(args._[0]);
const ENTRY = args.entry || 'index.html';
if (!fs.existsSync(path.join(ROOT, ENTRY))) { console.error(`Could not find ${ENTRY} in ${ROOT}`); process.exit(1); }
const OUT = path.resolve(args.out || path.join(ROOT, 'render'));
const formats = String(args.format || '16x9').split(',').map(s => s.trim());
for (const f of formats) if (!FORMATS[f]) { console.error(`Unknown format: ${f} (use ${Object.keys(FORMATS).join(', ')})`); process.exit(1); }

function startServer(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const target = fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file, 'index.html') : file;
    fs.readFile(target, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r(server)));
}

async function openPage(browser, base, fmt) {
  const [w, h] = FORMATS[fmt];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error(`[page error] ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') console.error(`[console] ${m.text()}`); });
  await page.goto(`${base}/${ENTRY}?render=1&format=${fmt}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.MOTION && typeof window.seek === 'function', null, { timeout: 30000 });
  const motion = await page.evaluate(async () => {
    await document.fonts.ready;
    if (window.MOTION.ready) await window.MOTION.ready;
    const { width, height, fps, duration, cssAnimations } = window.MOTION;
    return { width, height, fps, duration, cssAnimations: !!cssAnimations };
  });
  if (motion.width !== w || motion.height !== h) {
    console.warn(`[warning] MOTION says ${motion.width}x${motion.height}, but format ${fmt} is ${w}x${h}. Read ?format= in the page.`);
  }
  return { ctx, page, motion };
}

async function drawAt(page, t) {
  await page.evaluate(async (t) => {
    await window.seek(t);
    if (window.MOTION.cssAnimations) for (const a of document.getAnimations()) { a.pause(); a.currentTime = t * 1000; }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, t);
}

async function exportAudio(page, sampleRate, wavPath) {
  const has = await page.evaluate(() => typeof window.renderAudio === 'function');
  if (!has) return null;
  const info = await page.evaluate(async (sr) => {
    const b = await window.renderAudio(sr);
    window.__ab = b;
    let peak = 0;
    for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; } }
    return { ch: b.numberOfChannels, len: b.length, sr: b.sampleRate, peak };
  }, sampleRate);
  const chunks = [];
  const STEP = 1 << 18;
  for (let off = 0; off < info.len; off += STEP) {
    const b64 = await page.evaluate(([o, n]) => {
      const b = window.__ab, ch = b.numberOfChannels, end = Math.min(o + n, b.length);
      const data = Array.from({ length: ch }, (_, c) => b.getChannelData(c));
      const out = new Int16Array((end - o) * ch);
      for (let i = o; i < end; i++) for (let c = 0; c < ch; c++) {
        const s = Math.max(-1, Math.min(1, data[c][i]));
        out[(i - o) * ch + c] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      const u8 = new Uint8Array(out.buffer); let bin = '';
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(bin);
    }, [off, STEP]);
    chunks.push(Buffer.from(b64, 'base64'));
  }
  const data = Buffer.concat(chunks);
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8);
  hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(info.ch, 22);
  hdr.writeUInt32LE(info.sr, 24); hdr.writeUInt32LE(info.sr * info.ch * 2, 28); hdr.writeUInt16LE(info.ch * 2, 32);
  hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
  fs.writeFileSync(wavPath, Buffer.concat([hdr, data]));
  const dbfs = info.peak > 0 ? 20 * Math.log10(info.peak) : -Infinity;
  const note = info.peak >= 0.999 ? ' ⚠ CLIPPING — lower the master' : dbfs > -1 ? ' ⚠ above -1 dBFS' : dbfs < -12 ? ' ⚠ audio is quiet' : '';
  console.log(`  audio: ${(info.len / info.sr).toFixed(2)} s, peak ${dbfs.toFixed(1)} dBFS${note}`);
  return wavPath;
}

function contactSheet(dir, files) {
  if (!files.length) return;
  const cols = Math.min(4, files.length), rows = Math.ceil(files.length / cols);
  const list = path.join(dir, '.list.txt');
  fs.writeFileSync(list, files.map(f => `file '${path.join(dir, f).replace(/'/g, "'\\''")}'`).join('\n'));
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', `scale=480:-2,tile=${cols}x${rows}:padding=6:color=black`, '-frames:v', '1', path.join(dir, 'contact.png')]);
  fs.rmSync(list, { force: true });
}

async function stills(browser, base, fmt) {
  const { ctx, page, motion } = await openPage(browser, base, fmt);
  let times;
  if (args.stills && args.stills !== true) times = String(args.stills).split(',').map(Number);
  else {
    const step = Number(args.every) || 0.5;
    times = []; for (let t = 0; t < motion.duration - 1e-6; t += step) times.push(+t.toFixed(3));
    times.push(+(motion.duration - 1 / motion.fps).toFixed(3));
  }
  const dir = path.join(OUT, 'stills', fmt);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (const t of times) {
    await drawAt(page, t);
    const f = `t_${t.toFixed(2).padStart(6, '0')}.png`;
    await page.screenshot({ path: path.join(dir, f) });
    files.push(f);
  }
  contactSheet(dir, files);
  console.log(`  ${files.length} stills in ${dir}  (sheet: contact.png, order = ${times.join(', ')} s)`);
  await ctx.close();
}

async function video(browser, base, fmt) {
  const probe = await openPage(browser, base, fmt);
  const m = probe.motion;
  const fps = Number(args.fps) || m.fps || 30;
  const from = Math.max(0, Number(args.from) || 0);
  const to = Math.min(m.duration, args.to ? Number(args.to) : m.duration);
  const total = Math.round((to - from) * fps);
  const name = args.name || path.basename(ROOT);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `motion-${fmt}-`));
  const framesDir = path.join(tmp, 'frames'); fs.mkdirSync(framesDir);
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`▶ ${fmt} ${m.width}x${m.height} @${fps}fps, ${from}s→${to}s (${total} frames)`);

  const wav = await exportAudio(probe.page, 48000, path.join(tmp, 'audio.wav'));
  await probe.ctx.close();

  const workers = Math.max(1, Math.min(Number(args.workers) || Math.min(6, os.cpus().length), total));
  const per = Math.ceil(total / workers);
  let done = 0, lastPct = -1; const t0 = Date.now();
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const start = w * per, end = Math.min(total, start + per);
    if (start >= end) return;
    const { ctx, page } = await openPage(browser, base, fmt);
    for (let i = start; i < end; i++) {
      await drawAt(page, from + i / fps);
      await page.screenshot({ path: path.join(framesDir, `${String(i).padStart(6, '0')}.png`) });
      done++;
      const pct = Math.floor((done / total) * 20) * 5;
      if (pct !== lastPct) { lastPct = pct; process.stdout.write(`\r  frames ${pct}% (${done}/${total})   `); }
    }
    await ctx.close();
  }));
  console.log(`\n  capture: ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const out = path.join(OUT, `${name}-${fmt}.mp4`);
  const ff = ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(framesDir, '%06d.png')];
  if (wav) ff.push('-ss', String(from), '-t', String(to - from), '-i', wav, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k');
  ff.push('-c:v', 'libx264', '-preset', 'slow', '-crf', String(args.crf || 18), '-pix_fmt', 'yuv420p',
    '-r', String(fps), '-movflags', '+faststart', '-t', String(to - from), out);
  const r = spawnSync('ffmpeg', ff, { stdio: 'inherit' });
  if (r.status !== 0) { console.error('ffmpeg failed'); process.exit(1); }

  const info = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate',
    '-of', 'compact=p=0:nk=1', out]).toString().trim().split('\n').join(' | ');
  console.log(`  ✔ ${out}\n    ${info}`);
  if (args['keep-frames']) console.log(`    frames kept in ${framesDir}`);
  else fs.rmSync(tmp, { recursive: true, force: true });
}

if (args.serve) {
  const server = await startServer(Number(args.port) || 4321);
  const { port } = server.address();
  console.log(`Preview: http://localhost:${port}/${ENTRY}?format=${formats[0]}`);
  console.log('Click the page to play with sound. Space pauses, ←/→ jumps 1 s. Ctrl+C stops.');
} else {
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--font-render-hinting=none'] });
  try {
    if (args['audio-only']) {
      const { ctx, page } = await openPage(browser, base, formats[0]);
      fs.mkdirSync(OUT, { recursive: true });
      const wav = await exportAudio(page, 48000, path.join(OUT, `${args.name || 'soundtrack'}.wav`));
      if (!wav) { console.error('The page does not define window.renderAudio.'); process.exitCode = 1; }
      else console.log(`  ✔ ${wav}`);
      await ctx.close();
    } else {
      for (const fmt of formats) {
        if (args.stills || args.every) await stills(browser, base, fmt);
        else await video(browser, base, fmt);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
}
