from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path


def extract_wav_16k_mono(
    input_path: str, ffmpeg_exe: str | None = None
) -> tuple[Path, tempfile.TemporaryDirectory[str]]:
    """
    Decode input media to mono 16kHz PCM WAV using FFmpeg.
    Returns (wav_path, temp_dir_handle) — caller must keep temp_dir_handle alive
    until finished with wav_path, then call cleanup().
    """
    ffmpeg = ffmpeg_exe or "ffmpeg"
    tmp = tempfile.TemporaryDirectory(prefix="vte-audio-")
    wav_path = Path(tmp.name) / "audio.wav"
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-i",
        input_path,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        str(wav_path),
    ]
    subprocess.run(cmd, check=True)
    return wav_path, tmp
