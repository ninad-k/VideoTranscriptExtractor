#!/usr/bin/env bash
set -euo pipefail

# Builds a standalone `transcriber` sidecar using PyInstaller and places it into:
# - macOS: apps/desktop/src-tauri/bin/macos/transcriber
# - Linux: apps/desktop/src-tauri/bin/linux/transcriber
#
# Usage:
#   OS_BIN_DIR=macos ./scripts/build_transcriber_sidecar.sh
#   OS_BIN_DIR=linux ./scripts/build_transcriber_sidecar.sh

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SVC="$ROOT/services/transcriber"

OS_BIN_DIR="${OS_BIN_DIR:-}"
if [[ -z "${OS_BIN_DIR}" ]]; then
  echo "Set OS_BIN_DIR to 'macos' or 'linux'." >&2
  exit 2
fi

OUT_DIR="$ROOT/apps/desktop/src-tauri/bin/$OS_BIN_DIR"
mkdir -p "$OUT_DIR"

pushd "$SVC" >/dev/null

python3 -m pip install -U pip >/dev/null
python3 -m pip install -U pyinstaller >/dev/null
python3 -m pip install -e . >/dev/null

rm -rf build dist *.spec || true

python3 -m PyInstaller --noconfirm --onefile --name transcriber sidecar_entry.py

BIN="$SVC/dist/transcriber"
if [[ ! -f "$BIN" ]]; then
  echo "Expected output not found: $BIN" >&2
  exit 1
fi

cp -f "$BIN" "$OUT_DIR/transcriber"
chmod +x "$OUT_DIR/transcriber"
echo "Wrote: $OUT_DIR/transcriber"

popd >/dev/null

