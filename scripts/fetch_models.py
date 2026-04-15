from __future__ import annotations

import argparse
from pathlib import Path

import os

from huggingface_hub import snapshot_download
from huggingface_hub.utils import HfHubHTTPError


REPOS = {
    "large-v3": "Systran/faster-whisper-large-v3",
    "medium": "Systran/faster-whisper-medium",
}


def fetch(repo_id: str, out_dir: Path, token: str | None) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=repo_id,
        local_dir=str(out_dir),
        allow_patterns=["*"],
        token=token,
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
    p.add_argument(
        "--require-all",
        action="store_true",
        help="Fail if any model download fails. Default: skip gated/unavailable repos.",
    )
    args = p.parse_args()

    root = Path(__file__).resolve().parents[1]
    models_dir = (
        Path(args.models_dir).expanduser().resolve()
        if args.models_dir
        else root / "apps" / "desktop" / "src-tauri" / "models"
    )

    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")

    todo = [args.only] if args.only else list(REPOS.keys())
    failures: list[str] = []
    for model_id in todo:
        repo = REPOS[model_id]
        target = models_dir / model_id
        print(f"Downloading {repo} -> {target}")
        try:
            fetch(repo, target, token=token)
        except HfHubHTTPError as exc:
            # If a repo is gated/private and no token is provided, skip unless require-all.
            msg = str(exc)
            print(f"WARNING: failed to download {repo}: {msg}")
            failures.append(f"{model_id}: {repo} ({msg})")
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            print(f"WARNING: failed to download {repo}: {msg}")
            failures.append(f"{model_id}: {repo} ({msg})")

    if failures and args.require_all:
        raise SystemExit("Model download failures:\n- " + "\n- ".join(failures))

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

