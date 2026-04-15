# Transcriber worker

Python sidecar used by the desktop app. It expects `ffmpeg` on `PATH` unless you pass `--ffmpeg`.

## Setup

```bash
cd services/transcriber
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -e .
```

GPU (optional): install a CUDA-enabled `ctranslate2` / PyTorch stack matching your driver; otherwise transcription runs on CPU (slower).

## Manual run

```bash
python -m transcriber transcribe --input path\to\video.mp4 --result-json out.json --model large-v3 --language auto
```

Progress is printed as JSON lines on stdout (one object per line).
