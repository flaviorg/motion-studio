# Brand and reference

## Brand capture (`scripts/capture-site.mjs`)

```bash
node SKILL_DIR/scripts/capture-site.mjs https://example.com PROJ/assets
```

Writes to `PROJ/assets/`:
- `site-desktop.png` (1920×1080, above the fold), `site-full.png` (full page, up to 6000 px),
  `site-mobile.png` (390×844 @2x)
- `logo-*.svg|png|…` (candidates: logos in the header, images with "logo" in name/alt/class,
  inline header SVGs), `favicon-*`, `og-image.*`
- `brand-capture.json`: title, description, fonts by usage (weighted by text length), dominant
  text and background colors, `:root` CSS color variables, headings (h1–h3) and button copy

After running it:
1. Open the logos and pick the right one (sometimes the first candidate is a partner's icon).
   If an SVG logo uses `currentColor`, set the color explicitly.
2. Build the palette: 1 dominant, 1 accent, 2–3 neutrals, from the most-used colors and the CSS
   variables. Ignore UI greys that aren't part of the identity.
3. Fonts: use the real family via a local file or Google Fonts when available; otherwise the
   closest match.
4. To show the product, crop parts of the screenshots (`site-full.png`) instead of inventing.
   For in-app screens (behind login), ask the user for screenshots — don't invent them.
5. Tell the user: chosen logo, hex colors, fonts and which screenshots you'll use.

If the site blocks headless browsers (Cloudflare etc.), ask the user for logo, colors and
screenshots.

## Reference video (`scripts/analyze-reference.sh`)

Downloading from YouTube/X needs `yt-dlp` (`brew install yt-dlp`) — ask permission before
installing or downloading, or ask the user to send the file. Use the reference for style study
only; never reuse footage from it in the final video.

```bash
bash SKILL_DIR/scripts/analyze-reference.sh ref.mp4 PROJ/ref
```

Writes to `PROJ/ref/`:
- `info.txt` — duration, resolution, fps
- `cuts.txt` — scene cut timestamps; `cut_###.jpg` — one frame per cut
- `sheet_##.jpg` — contact sheets, 2 frames/s, 6×5 per sheet (15 s per sheet), timestamped
- `audio.wav` — to listen to / analyze the soundtrack if needed

Read the sheets and write `PROJ/ref/vocabulary.md`:
- Cuts per second and where the pacing speeds up or slows down
- Transition types (mask, whip pan, zoom, match cut, wipe)
- Typography: relative size, weight, how it enters and exits
- Camera: static, push-in, pan, 3D
- Palette and contrast, element density per frame
- What makes this reference good (2–3 sentences) — that is what you bring to the new video
