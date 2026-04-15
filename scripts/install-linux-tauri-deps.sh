#!/usr/bin/env bash
# System libraries required for `cargo check` / `tauri build` on Debian/Ubuntu (matches Tauri prerequisites).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if [ "$(id -u)" -eq 0 ]; then
  apt-get update
  apt-get install -y \
    build-essential \
    curl \
    wget \
    file \
    pkg-config \
    libssl-dev \
    libgtk-3-dev \
    libwebkit2gtk-4.1-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libxdo-dev
else
  sudo apt-get update
  sudo apt-get install -y \
    build-essential \
    curl \
    wget \
    file \
    pkg-config \
    libssl-dev \
    libgtk-3-dev \
    libwebkit2gtk-4.1-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libxdo-dev
fi
