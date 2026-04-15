#!/usr/bin/env bash
set -euo pipefail

# Fetch ffmpeg for macOS and place it into:
# apps/desktop/src-tauri/bin/macos/ffmpeg
#
# Strategy:
# - Prefer Homebrew-provided ffmpeg during CI.
# - Copy the binary into the bundle directory.
#
# Note: Homebrew bottles include their own licensing; ensure redistribution compliance if you ship them.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/apps/desktop/src-tauri/bin/macos"
mkdir -p "$OUT_DIR"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found. Installing via Homebrew..."
  brew update
  brew install ffmpeg
fi

FFMPEG_BIN="$(command -v ffmpeg)"
cp -f "$FFMPEG_BIN" "$OUT_DIR/ffmpeg"
chmod +x "$OUT_DIR/ffmpeg"
echo "Wrote: $OUT_DIR/ffmpeg"

