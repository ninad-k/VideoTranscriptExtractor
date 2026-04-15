This directory is packaged into the Tauri bundle as resources.

Place platform-specific sidecar binaries here:

- `ffmpeg` / `ffmpeg.exe`
- `transcriber` / `transcriber.exe`

Recommended layout:

- `bin/win64/ffmpeg.exe`
- `bin/win64/transcriber.exe`
- `bin/macos/ffmpeg`
- `bin/macos/transcriber`
- `bin/linux/ffmpeg`
- `bin/linux/transcriber`

Build/fetch scripts live in `scripts/`.

