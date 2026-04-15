#!/usr/bin/env bash
set -euo pipefail

# Fetch a static ffmpeg binary for Linux and place it into:
# apps/desktop/src-tauri/bin/linux/ffmpeg
#
# Source: johnvansickle.com static builds (LGPL/GPL varies by build).
# Verify license/compliance before redistribution.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/apps/desktop/src-tauri/bin/linux"
mkdir -p "$OUT_DIR"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
ARCHIVE="$TMP/ffmpeg.tar.xz"

echo "Downloading $URL"
curl -L --retry 5 --retry-delay 2 -o "$ARCHIVE" "$URL"

echo "Extracting..."
tar -xf "$ARCHIVE" -C "$TMP"

FFMPEG_PATH="$(find "$TMP" -type f -name ffmpeg -perm -u+x | head -n 1 || true)"
if [[ -z "${FFMPEG_PATH}" ]]; then
  echo "ffmpeg binary not found in archive" >&2
  exit 1
fi

cp -f "$FFMPEG_PATH" "$OUT_DIR/ffmpeg"
chmod +x "$OUT_DIR/ffmpeg"
echo "Wrote: $OUT_DIR/ffmpeg"

