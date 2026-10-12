#!/usr/bin/env bash
# Breaks a reference video into study material: info, scene cuts, contact sheets, audio.
# Usage: bash analyze-reference.sh <video> <output-dir> [cut-threshold=0.3]
set -euo pipefail
IN="$1"; OUT="$2"; TH="${3:-0.3}"
[ -f "$IN" ] || { echo "File not found: $IN"; exit 1; }
mkdir -p "$OUT"

ffprobe -v error -show_entries format=duration:stream=codec_type,width,height,r_frame_rate \
  -of default=nw=1 "$IN" > "$OUT/info.txt"
cat "$OUT/info.txt"

# One frame per scene cut + cut timestamps.
ffmpeg -hide_banner -y -i "$IN" -vf "select='gt(scene,$TH)',showinfo,scale=640:-2" -fps_mode vfr \
  "$OUT/cut_%03d.jpg" 2>&1 | grep -o 'pts_time:[0-9.]*' | cut -d: -f2 > "$OUT/cuts.txt" || true
echo "cuts: $(wc -l < "$OUT/cuts.txt" | tr -d ' ')  (cuts.txt / cut_###.jpg)"

# Contact sheets: 2 frames/s, 6x5 per sheet = 15 s per sheet.
ffmpeg -hide_banner -loglevel error -y -i "$IN" \
  -vf "fps=2,scale=320:-2,drawtext=text='%{pts\:hms}':x=6:y=6:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6,tile=6x5:padding=4:color=black" \
  "$OUT/sheet_%02d.jpg" 2>/dev/null || \
ffmpeg -hide_banner -loglevel error -y -i "$IN" -vf "fps=2,scale=320:-2,tile=6x5:padding=4:color=black" "$OUT/sheet_%02d.jpg"
echo "sheets: $(ls "$OUT"/sheet_*.jpg | wc -l | tr -d ' ')  (sheet_##.jpg, 15 s each)"

ffmpeg -hide_banner -loglevel error -y -i "$IN" -vn -ac 2 -ar 48000 "$OUT/audio.wav" 2>/dev/null && echo "audio: audio.wav" || echo "no audio"
