# Engine `hyperframes` — HyperFrames composition and render

Here motion-studio still owns the **process** (brief, brand, reference, beat grid, scored
critique, brand kit) and HyperFrames owns the **technical part** (composition structure,
timeline, block catalog, render). When the HyperFrames skills' technical rules and this file
disagree, HyperFrames wins on the technical side; the studio rules (`studio-rules.md`) win on
visuals, sound and critique.

Requires the HyperFrames skills (`hyperframes`, `hyperframes-core`, `hyperframes-cli`, …).
If they aren't installed, tell the user (`npx hyperframes skills update` installs them) and
offer `engine=code` instead.

## 0. Prepare

1. Load with the Skill tool, as needed:
   - `hyperframes-core` — **before writing any composition HTML** (the `data-*` contract, clips,
     tracks, sub-compositions, determinism).
   - `hyperframes-cli` — `init`, `catalog`, `add`, `check`, `snapshot`, `preview`, `render`.
   - `hyperframes-animation` / `hyperframes-keyframes` — motion and camera patterns.
   - `hyperframes-registry` — before hand-building a named effect (glitch, grain, shimmer,
     chart, terminal, map…): the catalog may already have it.
   - `hyperframes-audio` — mixing, fades and ducking.
2. Run the usage/version check the `hyperframes` skill asks for (`npx hyperframes usage --json`)
   and tell the user if the result is unknown. Without a connected account it returns
   `{"status":"unknown","reason":"unsupported_auth"}` — local renders still work.
3. Don't run the `hyperframes` intent interview or routing: the motion-studio brief and beat
   grid already do that job. If the CLI needs a `BRIEF.md`, generate it from `plan.md`. The
   `CLAUDE.md` that `init` writes into the project says to start at `/hyperframes`; here
   motion-studio has already played that role.
4. Create the project without letting `init` touch the user's installed skills:
   ```bash
   HYPERFRAMES_SKIP_SKILLS=1 npx -y hyperframes@latest init PROJ --non-interactive --resolution=landscape
   ```
   (`--resolution=portrait` for 9x16, `square` for 1x1). The generated `package.json` pins the
   CLI version; use `npx hyperframes@<that version>` for the following commands.
5. Assets (captures from step 2, fonts, soundtrack) go in `PROJ/assets/`.
   A validated starting point (0 findings on `check`): copy it over the fresh project with
   `cp -R SKILL_DIR/assets/template-hyperframes/. PROJ/` — it brings an `index.html` with 3
   scenes as sub-compositions, `compositions/`, `sound/` (soundtrack on the same grid), the
   local font and a sample `plan.md`. It is an 8 s example: replace all of its content.
6. **Fonts must be local files with `@font-face`** — a Google Fonts `<link>` fails lint
   (`font_family_without_font_face`). Download the `.woff2` (Google Fonts serves one variable
   file covering every weight; the `latin` subset includes Western European accents) into
   `PROJ/assets/` and declare `font-weight: 300 700` in the `@font-face`.

## 5. Build

- **One grid scene = one sub-composition** in `PROJ/compositions/<scene>.html`. With scenes
  nested directly in `index.html`, lint warns `nested_structure_needs_subcomposition`.
  The pattern that passed clean:
  - `index.html`: root `main` with the total `data-duration`; one `<div id="<scene>"
    data-composition-id="<scene>" data-composition-src="compositions/<scene>.html" data-start
    data-duration data-width data-height>` per scene; the `<audio id="soundtrack">`; and
    `window.__timelines["main"] = gsap.timeline({ paused: true })`. GSAP is loaded only here.
  - Sub-composition: everything inside `<template>` — `<style>` (with the `@font-face` again),
    markup and `<script>`. Root `<div id="<scene>-root" data-composition-id="<scene>">`, ids
    prefixed by the scene, timeline registered at `window.__timelines["<scene>"]`, script in an
    IIFE so `const`s don't leak between scenes.
  - Times inside a scene are **local**. If the scene starts before its downbeat (so the
    transition lands on the beat), keep the offset: e.g. scene at 3.8 s → the 4 s beat is
    local 0.2.
  - Overlapping scenes make the transitions: the next scene starts ~0.1–0.2 s before the beat
    and covers the previous one with clip-path/a mask.
- BPM → seconds: `beat = 60 / BPM`. Put the grid in a comment at the top of `index.html`.
- Initial state always via `fromTo` (never a CSS `transform` on the same element), and never
  animate `visibility`/`autoAlpha` on a clip — animate a child.
- Motion that intentionally leaves through a mask (text rising behind `overflow:hidden`): mark
  the element with `data-layout-allow-overflow` so the layout audit doesn't flag it.
- Counters: `fromTo(el, {textContent: 0}, {textContent: N, snap: {textContent: 1}})` is
  seekable (don't use `onUpdate`).
- Before hand-animating, search the catalog: `npx hyperframes catalog --query "<effect>"`.
- Formats: follow `hyperframes-core` for the composition size. For 16x9 + 9x16, recompose each
  format (variables or one composition per format) rather than shrinking.
- Run `npx hyperframes check` after every big step.

## 6. Sound

Keep the studio's code-synthesized soundtrack and hand it to HyperFrames as a file:

1. Copy the sound page and the kit:
   `mkdir -p PROJ/sound && cp SKILL_DIR/assets/sound/index.html SKILL_DIR/assets/template/kit.js PROJ/sound/`
   and adjust `BPM`, `DURATION`, the scene times `T` and the mix to match the grid.
2. Export the WAV (needs `bash SKILL_DIR/scripts/setup.sh` once):
   ```bash
   node SKILL_DIR/scripts/render.mjs PROJ/sound --audio-only --out PROJ/assets
   ```
   → `PROJ/assets/soundtrack.wav`
3. Put the WAV on the root of `index.html`:
   `<audio id="soundtrack" src="assets/soundtrack.wav" data-start="0" data-duration="<total>" data-track-index="<n>" data-volume="1"></audio>`
   — the `id` is mandatory (without it the render is silent) and never use `crossorigin`.
   Fades and ducking via `hyperframes-audio`.

If the user prefers library music/SFX, use `media-use`.

## 7.1 Frames for the critique

```bash
npx hyperframes check                          # lint + runtime + layout + motion + contrast
npx hyperframes snapshot --at 1.0,2.5,4.75     # frames at the critical times
npx hyperframes render --quality draft         # fast preview for rhythm and sound
```

`snapshot` writes `PROJ/snapshots/frame-NN-at-Xs.png` plus a `contact-sheet.jpg` with all of
them — open the sheet first. Pick the times from the grid: the middle of each entrance, the peak
of each transition and the last frame. Apply the studio rubric as usual; a clean `check`
(0 findings) is a technical gate, not a substitute for the score.

## 8. Final render

```bash
npx hyperframes render --quality delivery --output PROJ/render/<name>-<format>.mp4
```

For long renders, follow `hyperframes-cli` on running detached
(`HYPERFRAMES_RENDER_DETACHED=1`) and tailing the log. Then verify with `ffprobe` as in SKILL.md
and measure the audio: `ffmpeg -i <mp4> -af volumedetect -f null -` (max_volume ≤ -1 dB).

Reference speed: an 8 s 1080p composition renders in ~7 s with GPU on an Apple M-series laptop.
