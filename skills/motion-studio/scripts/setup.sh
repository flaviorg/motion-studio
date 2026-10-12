#!/usr/bin/env bash
# Installs Playwright + Chromium inside the skill folder (nothing global).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
command -v node >/dev/null || { echo "Node.js is missing (brew install node)"; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg is missing (brew install ffmpeg)"; exit 1; }
cd "$DIR"
npm install --no-audit --no-fund
npx playwright install chromium
echo "motion-studio is ready."
