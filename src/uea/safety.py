from __future__ import annotations

import os
from pathlib import Path


class SafetyBoundaryError(ValueError):
    """Raised when an operation targets a path outside the agent workspace."""


def agent_home() -> Path:
    configured = os.getenv("UEA_HOME")
    if configured:
        return Path(configured).expanduser().resolve()

    current = Path.cwd().resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "pyproject.toml").exists() and (candidate / "src" / "uea").is_dir():
            return candidate
    return current


def default_workspace() -> Path:
    return agent_home() / "workspace"


def resolve_internal_target(candidate: str | Path | None = None, *, create: bool = False) -> Path:
    home = agent_home()
    target = default_workspace() if candidate is None or str(candidate).strip() in {"", "."} else Path(candidate).expanduser()
    if not target.is_absolute():
        target = home / target
    target = target.resolve()
    try:
        target.relative_to(home)
    except ValueError as exc:
        raise SafetyBoundaryError(
            f"Safety boundary blocked this path. Target must remain inside the UEA folder: {home}"
        ) from exc
    if create:
        target.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        raise FileNotFoundError(f"Internal UEA workspace does not exist: {target}")
    if not target.is_dir():
        raise NotADirectoryError(f"Internal UEA workspace is not a directory: {target}")
    return target


def resolve_internal_file(root: Path, relative_name: str) -> Path:
    candidate = (root / relative_name).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError as exc:
        raise SafetyBoundaryError("File path escapes the internal UEA workspace.") from exc
    return candidate


def assert_safe_write_path(root: Path, path: Path) -> None:
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError as exc:
        raise SafetyBoundaryError("Write blocked: target is outside the internal UEA workspace.") from exc
