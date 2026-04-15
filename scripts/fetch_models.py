from __future__ import annotations

import argparse
from pathlib import Path

from huggingface_hub import snapshot_download


REPOS = {
    "large-v3": "Systran/faster-whisper-large-v3",
    "distil-large-v3": "Systran/faster-whisper-distil-large-v3",
}


def fetch(repo_id: str, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    # Download the full repo snapshot into out_dir (no symlinks -> portable).
    snapshot_download(
        repo_id=repo_id,
        local_dir=str(out_dir),
        local_dir_use_symlinks=False,
        allow_patterns=["*"],
    )


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--models-dir",
        default=None,
        help="Target directory to place model folders (default: apps/desktop/src-tauri/models)",
    )
    p.add_argument(
        "--only",
        default=None,
        choices=sorted(REPOS.keys()),
        help="Download only one model id (e.g. large-v3)",
    )
    args = p.parse_args()

    root = Path(__file__).resolve().parents[1]
    models_dir = (
        Path(args.models_dir).expanduser().resolve()
        if args.models_dir
        else root / "apps" / "desktop" / "src-tauri" / "models"
    )

    todo = [args.only] if args.only else list(REPOS.keys())
    for model_id in todo:
        repo = REPOS[model_id]
        target = models_dir / model_id
        print(f"Downloading {repo} -> {target}")
        fetch(repo, target)

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

