# FFmpeg bundling strategy

This application decodes arbitrary user media by shelling out to **FFmpeg**. Nothing in the repository redistributes FFmpeg binaries (license and size vary by build).

## Recommended approaches

1. **System install (simplest for development)**  
   Install FFmpeg and ensure `ffmpeg` is on `PATH`. The transcriber worker calls `ffmpeg` by default.

2. **Per-user path (settings)**  
   In the desktop app **Settings**, set **FFmpeg path** to your `ffmpeg.exe` (Windows) or `ffmpeg` binary (macOS / Linux). This is passed to the worker as `--ffmpeg`.

3. **First-run download (production installers)**  
   Ship a small bootstrapper that downloads a known build (e.g. static LGPL build for your target triple) into the app data directory, verifies a checksum, and stores that path in settings. Document the license in your installer `NOTICE` file.

4. **Sidecar in the bundle**  
   For enterprise or air-gapped installs, vendor a FFmpeg build next to the app and point **FFmpeg path** at install time or via environment variable `FFMPEG` (you can extend the worker to read this if needed).

## Audio pipeline

The worker extracts **mono 16 kHz WAV** PCM, which matches Whisper-family model expectations. Optional loudness normalization can be added later in `services/transcriber/src/transcriber/audio.py` if you see clipping or highly variable levels.
