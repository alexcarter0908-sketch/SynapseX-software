from __future__ import annotations

import json
import shutil
import subprocess
import time
from pathlib import Path

from .models import CommandResult


class TestCommand:
    def __init__(self, command: list[str], reason: str):
        self.command = command
        self.reason = reason

    def to_dict(self) -> dict[str, object]:
        return {"command": self.command, "reason": self.reason}


def discover_test_commands(root: Path) -> list[TestCommand]:
    commands: list[TestCommand] = []
    names = {path.name.lower() for path in root.iterdir() if path.is_file()}
    if "pyproject.toml" in names or "pytest.ini" in names or "pytest" in _read(root / "pyproject.toml").lower():
        commands.append(TestCommand(["python", "-m", "pytest", "-q"], "Python/pytest project indicator"))
    if "package.json" in names:
        package = _read_json(root / "package.json")
        scripts = package.get("scripts", {}) if isinstance(package, dict) else {}
        if isinstance(scripts, dict) and "test" in scripts:
            manager = "pnpm" if (root / "pnpm-lock.yaml").exists() else "yarn" if (root / "yarn.lock").exists() else "npm"
            commands.append(TestCommand([manager, "test"], f"package.json test script using {manager}"))
    if (root / "Cargo.toml").exists():
        commands.append(TestCommand(["cargo", "test"], "Cargo project"))
    if (root / "go.mod").exists():
        commands.append(TestCommand(["go", "test", "./..."], "Go module"))
    if (root / "pom.xml").exists():
        commands.append(TestCommand(["mvn", "test"], "Maven project"))
    if any(root.glob("*.csproj")) or any(root.glob("*.sln")):
        commands.append(TestCommand(["dotnet", "test"], ".NET project"))
    if (root / "composer.json").exists():
        package = _read_json(root / "composer.json")
        scripts = package.get("scripts", {}) if isinstance(package, dict) else {}
        if isinstance(scripts, dict) and "test" in scripts:
            commands.append(TestCommand(["composer", "test"], "Composer test script"))
    return _deduplicate(commands)


def execute_test_commands(root: Path, commands: list[TestCommand], timeout_seconds: int = 300) -> list[CommandResult]:
    results: list[CommandResult] = []
    for item in commands:
        executable = item.command[0]
        if shutil.which(executable) is None:
            results.append(CommandResult(item.command, "not_available", None, 0.0, stderr=f"Executable not found: {executable}"))
            continue
        started = time.perf_counter()
        try:
            completed = subprocess.run(
                item.command,
                cwd=root,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout_seconds,
                check=False,
            )
            results.append(CommandResult(
                command=item.command,
                status="passed" if completed.returncode == 0 else "failed",
                exit_code=completed.returncode,
                duration_seconds=round(time.perf_counter() - started, 3),
                stdout=completed.stdout[-12000:],
                stderr=completed.stderr[-12000:],
            ))
        except subprocess.TimeoutExpired as exc:
            results.append(CommandResult(
                command=item.command,
                status="timed_out",
                exit_code=None,
                duration_seconds=round(time.perf_counter() - started, 3),
                stdout=(exc.stdout or "")[-12000:] if isinstance(exc.stdout, str) else "",
                stderr=(exc.stderr or "")[-12000:] if isinstance(exc.stderr, str) else "",
                timed_out=True,
            ))
        except OSError as exc:
            results.append(CommandResult(item.command, "error", None, round(time.perf_counter() - started, 3), stderr=str(exc)))
    return results


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore") if path.exists() else ""
    except OSError:
        return ""


def _read_json(path: Path) -> dict[str, object]:
    try:
        value = json.loads(_read(path))
        return value if isinstance(value, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def _deduplicate(commands: list[TestCommand]) -> list[TestCommand]:
    seen: set[tuple[str, ...]] = set()
    result: list[TestCommand] = []
    for item in commands:
        key = tuple(item.command)
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result
