from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class Finding:
    severity: str
    category: str
    message: str
    path: str | None = None
    line: int | None = None
    recommendation: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class CommandResult:
    command: list[str]
    status: str
    exit_code: int | None
    duration_seconds: float
    stdout: str = ""
    stderr: str = ""
    timed_out: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class GitStatus:
    available: bool
    branch: str | None = None
    clean: bool | None = None
    changed_files: list[str] = field(default_factory=list)
    message: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ProjectProfile:
    root: str
    languages: list[str] = field(default_factory=list)
    frameworks: list[str] = field(default_factory=list)
    package_managers: list[str] = field(default_factory=list)
    databases: list[str] = field(default_factory=list)
    configuration_files: list[str] = field(default_factory=list)
    ci_cd: list[str] = field(default_factory=list)
    deployment: list[str] = field(default_factory=list)
    test_indicators: list[str] = field(default_factory=list)
    detected_files: list[str] = field(default_factory=list)
    git: GitStatus | None = None

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        if self.git is not None:
            result["git"] = self.git.to_dict()
        return result


@dataclass
class AuditResult:
    root: str
    findings: list[Finding] = field(default_factory=list)
    files_scanned: int = 0
    files_skipped: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "root": self.root,
            "findings": [item.to_dict() for item in self.findings],
            "files_scanned": self.files_scanned,
            "files_skipped": self.files_skipped,
            "summary": self.summary(),
        }

    def summary(self) -> dict[str, int]:
        result: dict[str, int] = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
        for finding in self.findings:
            result[finding.severity] = result.get(finding.severity, 0) + 1
        return result


def relative_path(root: Path, path: Path) -> str:
    try:
        return str(path.relative_to(root)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")
