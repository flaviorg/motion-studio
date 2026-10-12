# Engine `code` — hand-written HTML/JS + Playwright + ffmpeg

No framework: one page you write your own way, rendered frame by frame in headless Chromium.
In practice models produce richer motion this way than when boxed into a framework.

## 0. Prepare

1. The first time (or if `SKILL_DIR/scripts/node_modules` is missing), run
   `bash SKILL_DIR/scripts/setup.sh`. It installs Playwright + Chromium inside the skill only.
   Needs `node` and `ffmpeg` on the PATH.
2. Create `PROJ/` from the template: `cp -R SKILL_DIR/assets/template/ PROJ/`.
   The template is a working 8-second example — use it to learn the contract, then **replace
   its content entirely** with your video. Never ship something that looks like the template.
3. Don't load the hyperframes skills with this engine.

## 5. Build — the renderer contract

`PROJ/index.html` must expose:

```js
window.MOTION = {
  width, height,        // from the requested format in ?format=16x9|9x16|1x1|4x5
  fps: 30,              // 30 by default; 60 for very fluid UI
  duration: 20,         // seconds
  ready: Promise,       // optional: resolves when images/fonts/videos are ready
};
window.seek = (t) => {...};          // draws the EXACT state at time t (s). May be async.
window.renderAudio = async (sampleRate) => AudioBuffer;   // optional: music + SFX
```

The golden rule: **everything is a pure function of `t`**. `seek(3.2)` always produces the same
frame, in any order. No `Date.now()`, `performance.now()`, CSS transitions or unseeded
`Math.random()` during a render. The template already ships:
- `kit.js` (optional): easings, spring, `prog()`, beat grid, seeded RNG, format from the URL,
  live preview with audio and a scrubber, and sound synths.
- A local font file with `@font-face` (no network needed at render time).
- A responsive layout: the same page serves 16x9 and 9x16 by reading `?format=`.

Use any browser technique: DOM + transforms, SVG, Canvas 2D, WebGL, clip-path, masks, filters.
If you use a `<video>` in the page, `seek` must wait for `seeked`.

Live preview (for you and the user):

```bash
node SKILL_DIR/scripts/render.mjs PROJ --serve
```

## 6. Sound

Write `window.renderAudio` in the page itself with `renderMix` + `sfx` from the kit. The
renderer exports the WAV and muxes it into the MP4 on its own. The kit normalizes the peak to
-1.5 dBFS.

## 7.1 Frames for the critique

```bash
node SKILL_DIR/scripts/render.mjs PROJ --format 16x9 --every 0.5           # contact sheet
node SKILL_DIR/scripts/render.mjs PROJ --format 9x16 --stills 1.0,2.5,4.75  # exact moments
node SKILL_DIR/scripts/render.mjs PROJ --format 16x9 --fps 12 --name preview # rhythm + sound
```

Output in `PROJ/render/stills/<format>/` (`contact.png` + one PNG per time).

## 8. Final render

```bash
node SKILL_DIR/scripts/render.mjs PROJ --format 16x9,9x16 --name acme-launch
```

Output: `PROJ/render/<name>-<format>.mp4` (H.264 + AAC, yuv420p, faststart). Options:
`--workers 6`, `--from 10 --to 20` (a segment), `--crf 16` (higher quality), `--keep-frames`.
The script prints duration, resolution and the audio peak.

Long videos: render scene by scene with `--from/--to` and join with `ffmpeg -f concat`, or use
one page per scene.

Reference speed: an 8 s 1080p video (240 frames) captures in ~6 s on an Apple M-series laptop.
