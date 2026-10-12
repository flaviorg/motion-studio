// kit.js — optional Motion Studio helpers. Everything is a pure function of time t (seconds).
// Use what helps; write the rest your own way.

// ---------- time and easing ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, p) => a + (b - a) * p;
export const ease = {
  linear: p => p,
  outCubic: p => 1 - (1 - p) ** 3,
  inCubic: p => p ** 3,
  inOutCubic: p => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  outQuint: p => 1 - (1 - p) ** 5,
  inOutQuint: p => (p < 0.5 ? 16 * p ** 5 : 1 - (-2 * p + 2) ** 5 / 2),
  outExpo: p => (p >= 1 ? 1 : 1 - 2 ** (-10 * p)),
  inExpo: p => (p <= 0 ? 0 : 2 ** (10 * p - 10)),
  inOutExpo: p => (p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? 2 ** (20 * p - 10) / 2 : (2 - 2 ** (-20 * p + 10)) / 2),
  outBack: (p, s = 1.70158) => 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2,
};

// 0→1 progress over [start, start+dur], with easing.
export const prog = (t, start, dur, e = ease.outCubic) => e(clamp((t - start) / dur));

// Analytic damped spring (deterministic). Returns ~0→1 with overshoot depending on damping.
export function spring(t, { stiffness = 170, damping = 14, mass = 1 } = {}) {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(stiffness / mass), z = damping / (2 * Math.sqrt(stiffness * mass));
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

// Beat grid: beat(n) and bar(n) in seconds.
export function beatGrid(bpm, offset = 0, beatsPerBar = 4) {
  const spb = 60 / bpm;
  return { bpm, spb, beat: n => offset + n * spb, bar: n => offset + n * beatsPerBar * spb };
}

// Seeded RNG (mulberry32) — use instead of Math.random().
export function rng(seed = 1) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Format from the URL (?format=16x9|9x16|1x1|4x5).
export function format() {
  const map = { '16x9': [1920, 1080], '9x16': [1080, 1920], '1x1': [1080, 1080], '4x5': [1080, 1350] };
  const name = new URLSearchParams(location.search).get('format') || '16x9';
  const [w, h] = map[name] || map['16x9'];
  return { name, w, h, vertical: h > w, square: h === w };
}
export const isRender = () => new URLSearchParams(location.search).has('render');

// ---------- live preview ----------
// Outside a render: scales the stage to fit the window and loops with audio (click to
// start); space pauses, ←/→ jumps 1 s, scrubber at the bottom.
export function preview(stage) {
  if (isRender()) return;
  const M = window.MOTION;
  const fit = () => { const s = Math.min(innerWidth / M.width, (innerHeight - 40) / M.height); stage.style.transform = `scale(${s})`; stage.style.transformOrigin = '0 0'; };
  fit(); addEventListener('resize', fit);
  const bar = Object.assign(document.createElement('input'), { type: 'range', min: 0, max: M.duration, step: 1 / M.fps, value: 0 });
  Object.assign(bar.style, { position: 'fixed', left: '8px', right: '8px', bottom: '8px', width: 'calc(100% - 16px)', zIndex: 9999 });
  document.body.appendChild(bar);
  let t = 0, playing = false, last = 0, actx = null, src = null, buf = null;
  const stopAudio = () => { try { src?.stop(); } catch {} src = null; };
  const startAudio = async () => {
    if (!window.renderAudio) return;
    actx ??= new AudioContext();
    buf ??= await window.renderAudio(actx.sampleRate);
    stopAudio(); src = actx.createBufferSource(); src.buffer = buf; src.connect(actx.destination); src.start(0, t);
  };
  const play = async () => { playing = true; last = performance.now(); await startAudio(); };
  const pause = () => { playing = false; stopAudio(); };
  addEventListener('click', e => { if (e.target !== bar) (playing ? pause() : play()); });
  addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
    if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') { t = clamp(t + (e.code === 'ArrowRight' ? 1 : -1), 0, M.duration); if (playing) startAudio(); }
  });
  bar.addEventListener('input', () => { t = +bar.value; if (playing) startAudio(); });
  const loop = async (now) => {
    if (playing) { t += (now - last) / 1000; if (t >= M.duration) { t = 0; startAudio(); } }
    last = now; bar.value = t; await window.seek(t); requestAnimationFrame(loop);
  };
  (M.ready || Promise.resolve()).then(() => requestAnimationFrame(loop));
}

// ---------- sound ----------
export const hz = midi => 440 * 2 ** ((midi - 69) / 12);

// Creates the offline context with master + compressor + simple limiter and calls build(ctx, out).
export async function renderMix(duration, sampleRate, build, { masterGain = 0.8 } = {}) {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  const master = ctx.createGain(); master.gain.value = masterGain;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -2; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.05;
  master.connect(comp).connect(limit).connect(ctx.destination);
  const end = ctx.createGain(); end.connect(master);
  end.gain.setValueAtTime(1, Math.max(0, duration - 0.6)); end.gain.linearRampToValueAtTime(0, duration);
  await build(ctx, end);
  const buf = await ctx.startRendering();
  // Normalize the peak to -1.5 dBFS if it goes above (WebAudio's compressor is not a true limiter).
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) for (const v of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  const target = 10 ** (-1.5 / 20);
  if (peak > target) for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= target / peak; }
  return buf;
}

const noiseCache = new WeakMap();
function noise(ctx) {
  if (noiseCache.has(ctx)) return noiseCache.get(ctx);
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0), r = rng(7);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  noiseCache.set(ctx, b); return b;
}
function env(ctx, t, { a = 0.002, d = 0.2, peak = 1 } = {}) {
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); return g;
}
function noiseSrc(ctx, t, dur) { const s = ctx.createBufferSource(); s.buffer = noise(ctx); s.loop = true; s.start(t); s.stop(t + dur + 0.05); return s; }
function osc(ctx, type, f, t, dur) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(t + dur + 0.05); return o; }
function pan(ctx, v) { const p = ctx.createStereoPanner(); p.pan.value = v; return p; }

export const sfx = {
  kick(ctx, out, t, { gain = 0.9 } = {}) {
    const o = osc(ctx, 'sine', 150, t, 0.4); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    o.connect(env(ctx, t, { d: 0.35, peak: gain })).connect(out);
  },
  snare(ctx, out, t, { gain = 0.45 } = {}) {
    const n = noiseSrc(ctx, t, 0.25), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
    n.connect(bp).connect(env(ctx, t, { d: 0.18, peak: gain })).connect(out);
    osc(ctx, 'triangle', 190, t, 0.12).connect(env(ctx, t, { d: 0.1, peak: gain * 0.6 })).connect(out);
  },
  clap(ctx, out, t, { gain = 0.4 } = {}) { for (const k of [0, 0.012, 0.024]) sfx.snare(ctx, out, t + k, { gain: gain * 0.6 }); },
  hat(ctx, out, t, { gain = 0.18, open = false, p = 0.2 } = {}) {
    const n = noiseSrc(ctx, t, 0.3), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500;
    n.connect(hp).connect(env(ctx, t, { d: open ? 0.25 : 0.045, peak: gain })).connect(pan(ctx, p)).connect(out);
  },
  bass(ctx, out, t, midi, dur, { gain = 0.35, cutoff = 500 } = {}) {
    const o = osc(ctx, 'sawtooth', hz(midi), t, dur), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 4;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.setValueAtTime(gain, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(out);
  },
  pad(ctx, out, t, midis, dur, { gain = 0.08, cutoff = 1800 } = {}) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.8, dur / 3));
    g.gain.setValueAtTime(gain, t + dur * 0.75); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(hp).connect(g).connect(out);
    midis.forEach((m, i) => [-7, 7].forEach(c => { const o = osc(ctx, 'sawtooth', hz(m), t, dur); o.detune.value = c + i; o.connect(lp); }));
  },
  pluck(ctx, out, t, midi, { gain = 0.2, p = 0 } = {}) {
    const o = osc(ctx, 'square', hz(midi), t, 0.4), lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4000, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.3);
    o.connect(lp).connect(env(ctx, t, { d: 0.3, peak: gain })).connect(pan(ctx, p)).connect(out);
  },
  // Whoosh: lands on time `t` (the transition hit). dur = length of the build-up.
  whoosh(ctx, out, t, { dur = 0.5, gain = 0.35, from = 300, to = 5000 } = {}) {
    const s = t - dur, n = noiseSrc(ctx, s, dur + 0.3), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(from, s); bp.frequency.exponentialRampToValueAtTime(to, t);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(gain, t - 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    const p = ctx.createStereoPanner(); p.pan.setValueAtTime(-0.6, s); p.pan.linearRampToValueAtTime(0.6, t + 0.2);
    n.connect(bp).connect(g).connect(p).connect(out);
  },
  // Riser: builds up to `t`.
  riser(ctx, out, t, { dur = 2, gain = 0.18 } = {}) {
    const s = t - dur, o = osc(ctx, 'sawtooth', 200, s, dur); o.frequency.exponentialRampToValueAtTime(1600, t);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, s); lp.frequency.exponentialRampToValueAtTime(8000, t);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(gain, t); g.gain.linearRampToValueAtTime(0.0001, t + 0.03);
    o.connect(lp).connect(g).connect(out);
    sfx.whoosh(ctx, out, t, { dur, gain: gain * 1.2, from: 500, to: 9000 });
  },
  impact(ctx, out, t, { gain = 0.9 } = {}) {
    const o = osc(ctx, 'sine', 90, t, 1.2); o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    o.connect(env(ctx, t, { d: 1.1, peak: gain })).connect(out);
    const n = noiseSrc(ctx, t, 0.8), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.6);
    n.connect(lp).connect(env(ctx, t, { d: 0.7, peak: gain * 0.5 })).connect(out);
  },
  tick(ctx, out, t, { gain = 0.15, f = 2400 } = {}) { osc(ctx, 'sine', f, t, 0.03).connect(env(ctx, t, { d: 0.025, peak: gain })).connect(out); },
  pop(ctx, out, t, { gain = 0.25 } = {}) {
    const o = osc(ctx, 'sine', 500, t, 0.1); o.frequency.exponentialRampToValueAtTime(1300, t + 0.05);
    o.connect(env(ctx, t, { d: 0.08, peak: gain })).connect(out);
  },
};

// Loads an audio file (voiceover, the user's music) to mix in the same context.
export async function loadAudio(ctx, url) {
  const buf = await (await fetch(url)).arrayBuffer();
  return ctx.decodeAudioData(buf);
}
