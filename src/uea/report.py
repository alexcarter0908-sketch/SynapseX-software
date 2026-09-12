from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from .models import AuditResult, CommandResult, ProjectProfile
from .runner import TestCommand


def ensure_uea_directory(root: Path) -> Path:
    directory = root / ".uea"
    (directory / "reports").mkdir(parents=True, exist_ok=True)
    (directory / "cache").mkdir(parents=True, exist_ok=True)
    return directory


def append_log(root: Path, title: str, lines: Iterable[str]) -> Path:
    directory = ensure_uea_directory(root)
    log_path = directory / "engineering.log.md"
    timestamp = datetime.now(timezone.utc).isoformat()
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(f"\n## {title} — {timestamp}\n\n")
        for line in lines:
            handle.write(f"- {line}\n")
    return log_path


def render_report(
    profile: ProjectProfile,
    audit: AuditResult | None = None,
    test_commands: list[TestCommand] | None = None,
    test_results: list[CommandResult] | None = None,
) -> str:
    lines = [
        "# Universal Engineering Agent Report",
        "",
        f"**Generated:** {datetime.now(timezone.utc).isoformat()}",
        f"**Project:** `{profile.root}`",
        "",
        "## TASK",
        "Project inspection, security review, Git status collection, and available test validation.",
        "",
        "## ANALYSIS",
        "",
        "### Detected technology",
        "",
        _table(
            ["Area", "Detected"],
            [
                ["Languages", ", ".join(profile.languages) or "None detected"],
                ["Frameworks", ", ".join(profile.frameworks) or "None detected"],
                ["Package managers", ", ".join(profile.package_managers) or "None detected"],
                ["Databases", ", ".join(profile.databases) or "None detected"],
                ["CI/CD", ", ".join(profile.ci_cd) or "None detected"],
                ["Deployment", ", ".join(profile.deployment) or "None detected"],
            ],
        ),
        "",
        "### Configuration and tests",
        "",
        f"Configuration files: {', '.join(f'`{item}`' for item in profile.configuration_files) or 'None detected'}.",
        f"Test indicators: {', '.join(f'`{item}`' for item in profile.test_indicators[:30]) or 'None detected'}.",
        "",
        "## CHANGES",
        "No application source files were modified by this Phase 1 read-only workflow.",
        "",
        "## SECURITY",
    ]
    if audit is None:
        lines.append("Security audit was not run.")
    else:
        summary = audit.summary()
        lines.append(f"Scanned {audit.files_scanned} text files and skipped {audit.files_skipped} binary or oversized files.")
        lines.append("")
        lines.append(_table(
            ["Severity", "Findings"],
            [[key.title(), str(summary.get(key, 0))] for key in ["critical", "high", "medium", "low", "info"]],
        ))
        if audit.findings:
            lines.extend(["", "### Findings", ""])
            for finding in audit.findings:
                location = f"`{finding.path}:{finding.line}`" if finding.path and finding.line else "Project-wide"
                lines.append(f"- **{finding.severity.upper()}** — {location}: {finding.message} {finding.recommendation or ''}")
        else:
            lines.append("No configured pattern matched during this baseline audit. This is not a guarantee that the project is secure.")
    lines.extend(["", "## TESTS", ""])
    if test_commands:
        for item in test_commands:
            lines.append(f"- Discovered `{_format_command(item.command)}` ({item.reason}).")
    else:
        lines.append("No supported test command was detected.")
    if test_results:
        lines.append("")
        for result in test_results:
            lines.append(f"- `{_format_command(result.command)}`: **{result.status}** (exit code: {result.exit_code}, duration: {result.duration_seconds}s).")
    lines.extend([
        "",
        "## VERIFICATION",
        "The report records only commands and scans actually executed by the agent.",
        "",
        "## NOT VERIFIED",
        "Architecture correctness, runtime behavior not covered by detected tests, dependency exploitability, and production configuration were not fully verified by this baseline workflow.",
        "",
        "## NEXT STEPS",
        "Use the controlled execution and AI planning phases to analyze a specific task, generate a reversible patch, and validate the resulting change.",
        "",
    ])
    return "\n".join(lines)


def write_report(root: Path, content: str) -> Path:
    directory = ensure_uea_directory(root)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = directory / "reports" / f"engineering-report-{stamp}.md"
    path.write_text(content, encoding="utf-8")
    return path


def _format_command(command: list[str]) -> str:
    return " ".join(f'"{part}"' if " " in part else part for part in command)


def _table(headers: list[str], rows: list[list[str]]) -> str:
    output = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
    output.extend("| " + " | ".join(cell.replace("|", "\\|") for cell in row) + " |" for row in rows)
    return "\n".join(output)
