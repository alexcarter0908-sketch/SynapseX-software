from __future__ import annotations

from pathlib import Path
from typing import Any

from .inspect import detect_project
from .report import append_log, render_report, write_report
from .runner import discover_test_commands, execute_test_commands
from .security import audit_project


def run_baseline(root: Path, *, run_tests: bool = True, write_artifacts: bool = True) -> dict[str, Any]:
    """Run the non-destructive engineering baseline inside the approved workspace."""
    profile = detect_project(root)
    audit = audit_project(root)
    commands = discover_test_commands(root)
    results = execute_test_commands(root, commands) if run_tests else []
    report = render_report(profile, audit, commands, results)
    report_path: str | None = None
    if write_artifacts:
        report_path = str(write_report(root, report))
        append_log(root, "Baseline workflow", [
            f"Languages: {', '.join(profile.languages) or 'none detected'}",
            f"Security findings: {len(audit.findings)}",
            f"Test commands executed: {len(results)}",
            f"Report: {report_path}",
        ])
    return {
        "profile": profile.to_dict(),
        "audit": audit.to_dict(),
        "commands": [item.to_dict() for item in commands],
        "results": [item.to_dict() for item in results],
        "report": report,
        "report_path": report_path,
    }
