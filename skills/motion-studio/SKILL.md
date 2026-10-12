---
name: motion-studio
description: >
  A motion graphics studio for Claude Code: a studio process (brief, real brand capture,
  reference analysis, beat grid, code-synthesized soundtrack on the beat, scored critique loop,
  brand kit) with a switchable render engine — engine=code (hand-written HTML/JS rendered frame
  by frame with Playwright + ffmpeg) or engine=hyperframes (HyperFrames composition and render).
  Use this skill whenever the user asks for motion graphics, an animated video, a product launch
  video, animated Reels / Shorts / TikToks, a showreel, an animated ad, a landing page video, a UI
  animation, an intro or bumper, or a long animated YouTube video — even if they never say
  "motion". Also when they mention /motion-studio, "motion studio", "beat grid", "director
  brief", "engine=", "with hyperframes" or "without hyperframes". Prefer this skill over the
  hyperframes and motion-graphics skills for motion made from scratch: with engine=hyperframes it
  drives the HyperFrames skills itself for building and rendering.
---

# Motion Studio

Claude does not generate video: it writes a program, and the program becomes video. The prompt
is 10% of the result; the other 90% is the studio around it — rules, the real brand, a
reference, a plan on the beat, sound, and a scored review. This skill is that studio. The
**engine** is only the part that builds and renders; the process is the same with either one.

Talk to the user in their language; the files you write (plans, notes) follow the user's
language too.

Paths used below:
- `SKILL_DIR` = this skill's base directory (shown when the skill loads; for a plugin install
  it lives under `~/.claude/plugins/…`, for a manual install under `~/.claude/skills/motion-studio`)
- `PROJ` = the video's folder, created inside the current working directory (e.g. `./acme-launch/`)

## Choosing the engine

| Engine | How it works | Pick it when |
|---|---|---|
| `code` | One HTML/CSS/JS/SVG/Canvas page written freely, rendered frame by frame by `scripts/render.mjs` | Maximum creative freedom; the path where frontier models tend to do their best motion work. One page serves every aspect ratio |
| `hyperframes` | A HyperFrames composition (`data-*` timing, seekable timeline, block catalog), rendered by the `npx hyperframes` CLI | You want catalog blocks/effects, the Studio timeline editor, captions, footage editing, cloud rendering |

Decide in this order and stop at the first that answers:

1. **Explicit request.** `engine=code` / `engine=hyperframes` in the arguments or message, or
   phrases like "with/using hyperframes" → `hyperframes`; "without hyperframes", "pure code",
   "your own way" → `code`.
2. **Existing project.** When continuing a video: `PROJ/hyperframes.json` → `hyperframes`;
   `PROJ/index.html` with `window.seek` → `code`. Don't switch a project's engine midway unless
   the user asks.
3. **User default.** Read `~/.claude/motion-studio.json` if it exists, otherwise
   `SKILL_DIR/config.json`, and use `default_engine`. If it is `ask`, ask one question with both
   options and the recommendation from the table.

Announce the engine in one line and why (e.g. "Engine: code (your default). Say
engine=hyperframes to switch."). Record it at the top of `PROJ/plan.md`.

If the user wants to change the default ("always use hyperframes", "always ask me"), write
`{"default_engine": "<code|hyperframes|ask>"}` to `~/.claude/motion-studio.json` — that file
survives plugin updates.

Then read the engine file — it details steps 0, 5, 6, 7.1 and 8:
- `code` → `references/engine-code.md`
- `hyperframes` → `references/engine-hyperframes.md`

Also read `references/studio-rules.md` before building: the anti-"AI slop" visual rules, sound
rules and the critique rubric apply to both engines.

## 0. Prepare

Follow "Prepare" in the engine file. Every new video gets a new folder; don't reuse or edit
earlier videos unless asked.

## 1. Brief

Find out (from the request, the conversation, or by asking) the minimum:
product/message · length · format(s) (16x9, 9x16, 1x1, 4x5) · emotion and energy ·
visual reference · brand (site, logo, colors, fonts) · music (BPM/mood) · where it will be posted.

- Short request and the user said "go all out" / "you decide": decide and proceed, writing the
  decisions at the top of the plan.
- Client work, anything over ~20 s, or YouTube: use the template in
  `references/director-brief.md`. If the user can't write the direction part, help them build it
  with questions.
- Look for a `brand.md` in PROJ, its parent, or wherever the user points: it is the brand kit
  from earlier projects and beats any guess.
- With `engine=hyperframes`, this brief replaces the HyperFrames intent interview: don't ask
  the same questions twice.

## 2. Real brand

If the product has a website, capture the real brand instead of inventing one (works for both
engines; needs the one-time setup, `bash SKILL_DIR/scripts/setup.sh`):

```bash
node SKILL_DIR/scripts/capture-site.mjs <url> PROJ/assets
```

It saves screenshots (desktop, full page, mobile), logo candidates, og:image and a
`brand-capture.json` with fonts, dominant colors, CSS color variables, headings and button copy.
Open the screenshots and logos to check them, and **list what you found for the user** (chosen
logo, hex colors, fonts, useful screenshots) before animating.

- Use the real fonts. If a font is proprietary and unavailable, use the closest one and say which.
- Never invent screens of a real product as if they were screenshots. Use the captured shots
  (cropped, in mockups, with zoom/pan) or a clearly stylized/abstract UI.
- Details in `references/brand-and-reference.md`.

## 3. Reference (when there is one)

If the user provides a reference video (a local file, or a link downloaded with their
permission), extract its motion vocabulary:

```bash
bash SKILL_DIR/scripts/analyze-reference.sh <video> PROJ/ref
```

It produces contact sheets (2 frames/s), one frame per scene cut and the cut timestamps. Read
the images and write a short "motion vocabulary". Copy **the structure and motion language,
never the content**.

## 4. Beat grid (plan before code)

Before building, show the user a table of states on the beat grid:

| # | Time (s) | Bar.beat | On screen | Motion / transition | Sound |
|---|----------|----------|-----------|---------------------|-------|

- Pick the BPM first. Every scene change lands on a downbeat; visual accents match audio accents.
- Long video: first a scene table (scene, length, goal, visual idea), then one grid per scene.
- **Wait for approval** before rendering — changing a table is cheap, re-rendering is not.
  Skip the wait only if the user explicitly said not to ask.
- Save the approved table to `PROJ/plan.md` (engine at the top).

## 5. Build

Follow "Build" in the engine file. With any engine: everything is a function of time
(deterministic), and every format is truly recomposed, not just scaled down.

## 6. Sound in code

An original soundtrack and SFX synthesized with `OfflineAudioContext`, using **the same timing
constants** as the grid (BPM, scene times) — that is what locks the sound to the beat.
`assets/template/kit.js` ships kick, snare, clap, hat, bass, pad, pluck, whoosh, riser, impact,
tick and pop. The user's voiceover or music: load it and mix it in the same context, ducking the
music under the voice. How the audio reaches the video depends on the engine (see engine file).

## 7. Critique loop (before showing anything)

Never deliver the first render. Run rounds:

1. Generate key frames and a cheap preview (commands in the engine file) and open the images of
   the critical moments: transition peaks, text, scene endings.
2. Score each rubric criterion 1–10 (`studio-rules.md`) in a short table.
3. Fix the **3 worst** problems. Repeat until every criterion is ≥ 8.
4. Cap it at ~4 rounds: if something won't move, stop and tell the user what is blocking it.

## 8. Final render and verification

Follow "Final render" in the engine file. Before announcing, check with `ffprobe` (duration,
resolution, audio stream), pull 2–3 frames from the final MP4 and look at them; audio peak
≤ -1 dBFS.

Long videos (YouTube): work scene by scene (30–90 s each), render and review each scene, then
join them at the end.

Deliver: MP4 paths, the engine used, the final score table, and what you decided on your own.

## 9. Brand kit (after the user approves)

When the user likes the result, save a `brand.md` in the brand's folder (or wherever they say)
with: logo path, hex colors and the role of each, fonts and weights, motion signature (easings,
durations, transition types), sound signature (BPM, timbres), safe zones used, engine used, and
what to avoid. The next video for the same brand starts from it.
