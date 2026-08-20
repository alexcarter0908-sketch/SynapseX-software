from __future__ import annotations

import subprocess
from pathlib import Path

from .models import GitStatus


def _run_git(root: Path, args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=10,
        check=False,
    )


def inspect_git(root: Path) -> GitStatus:
    try:
        branch_result = _run_git(root, ["branch", "--show-current"])
        if branch_result.returncode != 0:
            return GitStatus(available=False, message=branch_result.stderr.strip() or "Not a Git repository")
        status_result = _run_git(root, ["status", "--porcelain"])
        changed = [line[3:] for line in status_result.stdout.splitlines() if len(line) >= 4]
        return GitStatus(
            available=True,
            branch=branch_result.stdout.strip() or "detached HEAD",
            clean=not changed,
            changed_files=changed,
        )
    except (FileNotFoundError, subprocess.SubprocessError, OSError) as exc:
        return GitStatus(available=False, message=str(exc))
