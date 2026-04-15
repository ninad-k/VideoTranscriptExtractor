# Video Transcript Extractor

Cross-platform **offline** desktop app for extracting **Hindi**, **English**, and **Hinglish** transcripts from video files using Whisper-class models (**faster-whisper**). Audio is decoded with **FFmpeg**; inference runs in a **Python sidecar** invoked from a **Tauri 2** shell.

## Repository layout

- [`apps/desktop`](apps/desktop) — Tauri 2 + React (Vite + TypeScript) UI
- [`services/transcriber`](services/transcriber) — Python worker (`python -m transcriber`)
- [`docs/FFMPEG.md`](docs/FFMPEG.md) — FFmpeg deployment options
- [`docs/MODELS.md`](docs/MODELS.md) — Model tiers and cache notes
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — bundling FFmpeg + transcriber in the installer

## Prerequisites

- **Rust** toolchain (for Tauri). On Windows, install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **Desktop development with C++** workload so `link.exe` is available.
- **Node.js** + **npm** (for the Vite frontend).
- **Python** 3.10+ with the transcriber package installed.
- **FFmpeg** on `PATH` or configured in the app settings.

## Python worker

```bash
cd services/transcriber
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -e .
```

Optional: set `VTE_PYTHON` to a full path if `python` is not on `PATH`.

## Desktop app (development)

```bash
cd apps/desktop
npm install
npm run tauri dev
```

The Rust side resolves the worker at `services/transcriber` relative to the repo and sets `PYTHONPATH` to `services/transcriber/src`.

## Desktop app (deployable installer with bundled dependencies)

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Data locations

- **SQLite job history**: `%LOCALAPPDATA%\VideoTranscriptExtractor\jobs.sqlite3` on Windows (see [`dirs`](https://docs.rs/dirs/latest/dirs/fn.data_local_dir.html) for other platforms).
- **Settings JSON**: per-user config directory under `VideoTranscriptExtractor/settings.json`.

## License

See [LICENSE](LICENSE). Third-party components (FFmpeg builds, Whisper weights, Tauri, etc.) carry their own licenses when you distribute binaries.
