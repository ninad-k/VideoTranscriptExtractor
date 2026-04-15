# Model tiers and cache

## Presets (desktop UI)

| Quality | Whisper model        | Typical use                          |
| ------- | -------------------- | ------------------------------------ |
| Draft   | `distil-large-v3`    | Faster passes, weaker hardware      |
| Final   | `large-v3`         | Best offline accuracy for delivery |

Models are downloaded automatically by **faster-whisper** (CTranslate2) on first use.

## Cache directory

- **Default**: Hugging Face / CTranslate2 default cache for your user account.
- **Override**: set **Model cache directory** in app settings. This is passed to the worker as `--model-cache-dir`.

## Verification

The current implementation relies on upstream download integrity from the model hub. If you need tamper-evident installs, extend the worker to verify a pinned checksum after download (or ship models inside a signed installer).

## Hardware expectations

- **NVIDIA GPU**: CUDA builds of `ctranslate2` give the best throughput for `large-v3`.
- **CPU-only**: usable with Draft / smaller models; expect much higher real-time factors.

If you hit GPU out-of-memory errors, use **Draft** quality or free VRAM; the UI surfaces a short tip when the worker reports `cuda_oom`.
