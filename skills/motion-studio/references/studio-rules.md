# Studio rules

These rules exist because a model's "default" output is predictable: a centered title over a
gradient, everything fading in, generic colors. Each rule fights one of those habits or a
technical render defect.

## Render

- **Determinism.** A frame depends only on `t`. No wall clock, no unseeded `Math.random()` (use
  `rng(seed)` from the kit), no CSS transitions. CSS `@keyframes` only if you set
  `MOTION.cssAnimations = true` (code engine) — the renderer then pauses them all and positions
  them at `t`; they must start at t = 0 (use `animation-delay` for the rest).
- **Preload everything** (fonts, images, video) and resolve readiness only afterwards. A font
  that loads mid-render causes layout jumps.
- **Native resolution.** 1920×1080 (16x9), 1080×1920 (9x16), 1080×1080 (1x1), 1080×1350 (4x5).
  Design for the real size; never upscale small rasters.
- **30 fps** by default; 60 fps for UI with lots of scrolling/continuous motion.
- **Vertical safe zones** (Reels/TikTok/Shorts): nothing important in the top 250 px, the
  bottom ~380 px or the right ~120 px.
- **Legibility.** Vertical: main text ≥ 64 px, secondary ≥ 40 px; 16x9: ≥ 56 px and ≥ 32 px.
  Strong contrast. Important text holds still and readable for at least ~1.2 s (≈ 0.3 s per word).

## Visual (anti "AI slop")

Avoid, unless explicitly requested:
- A centered title over a purple/blue gradient, or Claude's default beige/orange.
- Everything entering with an opacity fade. A fade is seasoning, not the main course.
- Glassmorphism cards, blobs and particles floating for no reason.
- Emoji icons, made-up metrics, fake testimonials, lorem ipsum.
- Invented product screens pretending to be real.
- Too much text: one idea per beat, up to ~7 words on screen in social videos.

Prefer:
- **Typography as the hero:** big kinetic type, words entering through masks/clip-path, weight
  and scale shifts, intentional line breaks.
- **Reveals with transform + clip-path** (slide behind a mask, wipe, scale from a point), with
  2–3 consistent easings across the whole video.
- **Stagger** of 40–80 ms between siblings; springs with slight overshoot for UI.
- **Camera:** move the whole stage (pan, push-in, subtle rotation) with layered parallax.
- **Motion blur** on fast moves (ghost copies with decreasing opacity, or `filter: blur()`
  proportional to speed, on the motion axis when possible).
- **Exits as designed as entrances.** Nothing just vanishes.
- **Pacing variation:** fast-fast-hold. The still moments give weight to the fast ones.
- **Grid and alignment:** consistent margins; left alignment usually feels more editorial than
  centering everything.
- **Brand color with hierarchy:** one dominant color, one accent, neutrals. The accent is rare.
- **Real screenshots in moving mockups:** zoom into details, a guiding cursor, highlights drawn
  on top, crops that follow the story.

## Sound

- Original soundtrack synthesized in code (no copyrighted music).
- BPM by energy: 85–100 calm/premium, 110–128 energetic/product, 140+ hype.
- Scene changes on downbeats; visual accents = audio accents.
- Use SFX sparingly: a whoosh starting ~0.1 s before fast transitions, an impact on key
  reveals, ticks for typing/counters, a riser before a "drop". Don't sonify every move.
- Silence and a "drop" (pulling the beat for one bar) create emphasis.
- Mix: peak ≤ -1 dBFS, no clipping; kick and bass not fighting (cut the pad's lows);
  voiceover +6 to +10 dB above the music, with ducking.
- 0.3–1 s fade at the end; the last frame and the last sound end together.

## Critique rubric (score 1–10, target ≥ 8 on all)

| Criterion | What to look at |
|---|---|
| Brand | Real logo, colors and fonts, well applied; feels like the company, not generic |
| Hierarchy & legibility | Can everything be read in time? Size, contrast, safe zones |
| Rhythm & sync | Cuts and accents on the beat; pacing variation; nothing drags |
| Motion quality | Coherent easings, overshoot in measure, no generic fades, no jitter |
| Composition | Grid, margins, balance in each format (vertical recomposed, not shrunk) |
| Originality | Free of the "avoid" list; has a visual idea of its own |
| Message | In one sentence, what does the viewer get? Does it match the brief? Clear CTA |
| Technical finish | No overflowing text, missing fonts, flicker, empty frames, hard cut at the end, clipping |

Round format:

```
Round 2 — Brand 9 · Hierarchy 7 · Rhythm 8 · Motion 6 · Composition 8 · Originality 7 · Message 9 · Technical 8
Fix now: (1) Motion: cards enter with a plain fade → mask + spring
(2) Hierarchy: 28 px subtitle in 9x16 → 44 px  (3) Originality: gradient background → real screenshot with push-in
```
