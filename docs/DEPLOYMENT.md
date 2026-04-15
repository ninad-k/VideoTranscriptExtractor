# Deployment (bundled dependencies)

Goal: produce a **deployable installer** where users do **not** need to install Python or FFmpeg manually.
Optionally, you can also **prebundle Whisper models** so first-run is fully offline.

This project bundles two sidecars into the Tauri app resources:

- **FFmpeg** (`ffmpeg` / `ffmpeg.exe`)
- **Transcriber worker** (`transcriber` / `transcriber.exe`) built from `services/transcriber`

And optionally bundles model folders:

- `models/large-v3/`
- `models/medium/`

The app will use:

1. **Settings path** if provided (for FFmpeg), else
2. **Bundled binaries** in the app resources, else
3. **Dev fallback** (Python `-m transcriber`) when running from a repo checkout.

## Where bundled binaries live

Put binaries under:

- `apps/desktop/src-tauri/bin/win64/`
- `apps/desktop/src-tauri/bin/macos/`
- `apps/desktop/src-tauri/bin/linux/`

These are included in the installer via `bundle.resources` in:

- [`apps/desktop/src-tauri/tauri.conf.json`](apps/desktop/src-tauri/tauri.conf.json)

## Prebundle models (fully offline first-run)

Install bundling dependencies:

```bash
py -3 -m pip install -r scripts/requirements-bundling.txt
```

Download models into `apps/desktop/src-tauri/models/`:

```bash
py -3 scripts/fetch_models.py
```

This creates:

- `apps/desktop/src-tauri/models/large-v3/`
- `apps/desktop/src-tauri/models/medium/`

At runtime, the app will pass `--model-path` pointing at these resource directories, so no network download is needed.

## Windows: bundle FFmpeg

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\fetch_ffmpeg_windows.ps1
```

This writes:

- `apps/desktop/src-tauri/bin/win64/ffmpeg.exe`

## Windows: bundle the Transcriber worker

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_transcriber_sidecar.ps1
```

This writes:

- `apps/desktop/src-tauri/bin/win64/transcriber.exe`

## Build the installer

From `apps/desktop`:

```bash
npm install
npm run tauri build
```

## CI: Windows installer (tag releases)

- **Main branch** runs a lightweight workflow (unit tests, Vite build, `cargo check`) and does **not** produce installers: [`.github/workflows/build-main.yml`](.github/workflows/build-main.yml).
- **Version tags** (`v*`, e.g. `v0.1.0`) trigger the Windows installer build, which downloads and bundles **FFmpeg**, **transcriber**, and **prebundled models**, uploads artifacts, and publishes a GitHub Release: [`.github/workflows/build-installers.yml`](.github/workflows/build-installers.yml).

## Licensing / compliance notes

- **FFmpeg**: your redistribution obligations depend on whether you use LGPL or GPL builds and what codecs are enabled in the binary you ship. Keep a `NOTICE` file with the correct license text and attribution for the exact build you redistribute.
- **Models**: Whisper-family weights are downloaded at runtime by `faster-whisper`. If you choose to ship weights inside the installer, ensure you comply with the model license and document source.

