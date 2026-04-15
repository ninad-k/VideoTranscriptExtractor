from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import ctranslate2


def _emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _pick_device() -> str:
    return "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"


def _pick_compute_type(device: str) -> str:
    if device == "cuda":
        return "float16"
    return "int8"


def _looks_like_cuda_oom(message: str) -> bool:
    m = message.lower()
    return "out of memory" in m or ("cuda" in m and ("oom" in m or "memory" in m))


def _transcribe(args: argparse.Namespace) -> int:
    from faster_whisper import WhisperModel

    from transcriber.audio import extract_wav_16k_mono

    input_path = str(Path(args.input).expanduser().resolve())
    result_json = str(Path(args.result_json).expanduser().resolve())

    _emit(
        {
            "type": "progress",
            "status": "extracting",
            "percent": 1.0,
            "message": "Extracting audio with FFmpeg…",
        }
    )

    wav_path: Path | None = None
    tmp = None
    try:
        wav_path, tmp = extract_wav_16k_mono(input_path, args.ffmpeg)
    except Exception as exc:  # noqa: BLE001
        _emit({"type": "error", "code": "ffmpeg", "message": f"FFmpeg failed: {exc}"})
        return 1

    try:
        device = _pick_device()
        compute_type = _pick_compute_type(device)

        download_root = None
        if args.model_cache_dir:
            download_root = str(Path(args.model_cache_dir).expanduser().resolve())

        _emit(
            {
                "type": "progress",
                "status": "transcribing",
                "percent": 5.0,
                "message": f"Loading model {args.model_path or args.model} on {device} ({compute_type})…",
            }
        )

        try:
            model = WhisperModel(
                args.model_path or args.model,
                device=device,
                compute_type=compute_type,
                download_root=download_root,
            )
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            if _looks_like_cuda_oom(msg):
                _emit({"type": "error", "code": "cuda_oom", "message": msg})
                return 2
            _emit({"type": "error", "code": "model_load", "message": msg})
            return 1

        language = None if args.language == "auto" else args.language

        _emit(
            {
                "type": "progress",
                "status": "transcribing",
                "percent": 8.0,
                "message": "Transcribing…",
            }
        )

        started = time.perf_counter()
        try:
            segments_iter, info = model.transcribe(
                str(wav_path),
                language=language,
                task="transcribe",
                vad_filter=True,
                beam_size=5,
            )
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            if _looks_like_cuda_oom(msg) or (
                "cuda" in msg.lower() and "alloc" in msg.lower()
            ):
                _emit({"type": "error", "code": "cuda_oom", "message": msg})
                return 2
            _emit({"type": "error", "code": "transcribe", "message": msg})
            return 1

        duration = float(getattr(info, "duration", 0.0) or 0.0)
        if duration <= 0 and wav_path is not None:
            try:
                import wave

                with wave.open(str(wav_path), "rb") as wf:
                    frames = wf.getnframes()
                    rate = wf.getframerate() or 16000
                    duration = frames / float(rate)
            except Exception:  # noqa: BLE001
                duration = 0.0

        out_segments: list[dict] = []
        last_end = 0.0
        for idx, seg in enumerate(segments_iter):
            last_end = float(seg.end)
            out_segments.append(
                {
                    "id": idx,
                    "start": float(seg.start),
                    "end": float(seg.end),
                    "text": seg.text.strip(),
                    "avg_logprob": getattr(seg, "avg_logprob", None),
                    "no_speech_prob": getattr(seg, "no_speech_prob", None),
                }
            )
            denom = max(duration, last_end, 1e-3)
            pct = min(99.0, max(8.0, (last_end / denom) * 100.0))
            elapsed = time.perf_counter() - started
            rtf = (elapsed / denom) if denom > 0 else None
            eta = None
            if rtf is not None and duration > 0:
                eta = max(0.0, (duration * rtf) - elapsed)
            _emit(
                {
                    "type": "progress",
                    "status": "transcribing",
                    "percent": pct,
                    "message": "Transcribing…",
                    "rtf": rtf,
                    "eta_seconds": eta,
                    "audio_duration_sec": duration if duration > 0 else None,
                }
            )

        elapsed_total = time.perf_counter() - started
        denom_total = max(duration, last_end, 1e-3)
        rtf_total = elapsed_total / denom_total if denom_total > 0 else None

        payload = {
            "segments": out_segments,
            "model": args.model_path or args.model,
            "device": device,
            "compute_type": compute_type,
            "audio_duration_sec": duration if duration > 0 else last_end,
            "rtf": rtf_total,
        }

        Path(result_json).parent.mkdir(parents=True, exist_ok=True)
        Path(result_json).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        _emit(
            {
                "type": "progress",
                "status": "completed",
                "percent": 100.0,
                "message": "Done",
                "rtf": rtf_total,
                "eta_seconds": 0.0,
                "audio_duration_sec": payload["audio_duration_sec"],
            }
        )

        return 0
    finally:
        if tmp is not None:
            tmp.cleanup()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="transcriber")
    sub = parser.add_subparsers(dest="command", required=True)

    tr = sub.add_parser("transcribe", help="Transcribe a media file offline")
    tr.add_argument("--input", required=True, help="Input video or audio path")
    tr.add_argument("--result-json", required=True, help="Where to write the JSON result")
    tr.add_argument(
        "--model",
        default="large-v3",
        help="Whisper model size (e.g. large-v3, distil-large-v3, medium)",
    )
    tr.add_argument(
        "--model-path",
        default=None,
        help="Optional local path to a prebundled CTranslate2 model directory (overrides --model)",
    )
    tr.add_argument(
        "--language",
        default="auto",
        help="Language hint: auto|hi|en",
    )
    tr.add_argument(
        "--ffmpeg",
        default=None,
        help="Path to ffmpeg executable (defaults to ffmpeg on PATH)",
    )
    tr.add_argument(
        "--model-cache-dir",
        default=None,
        help="Optional Hugging Face / CTranslate2 model download cache directory",
    )
    tr.set_defaults(func=_transcribe)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    func = getattr(args, "func", None)
    if func is None:
        parser.print_help()
        return 2
    return int(func(args))
