from __future__ import annotations

from pathlib import Path
from typing import Any

from .changes import TextChange, apply_changes, validate_changes
from .inspect import detect_project
from .llm import generate_task
from .report import append_log
from .runner import discover_test_commands, execute_test_commands
from .security import audit_project


def run_authorized_autonomy(root: Path, request: str, model: str | None, *, apply: bool, timeout_seconds: int = 300) -> dict[str, Any]:
    """Execute one bounded engineering loop inside an already-authorized UEA workspace.

    This function deliberately does not run generated shell commands, access external
    directories, publish code, reveal secrets, or apply database migrations. It only
    uses the existing validated TextChange path and the repository's discovered test
    commands, so every write has a timestamped backup and every execution is auditable.
    """
    profile = detect_project(root)
    audit = audit_project(root)
    proposal = generate_task(root, request, model)
    changes = [TextChange(**item) for item in proposal.get("changes", [])]
    validation_errors = validate_changes(root, changes)
    result: dict[str, Any] = {
        "ok": not validation_errors,
        "mode": "authorized-autonomy",
        "request": request,
        "profile": profile.to_dict(),
        "security_summary": audit.summary,
        "security_findings": len(audit.findings),
        "proposal": proposal,
        "validated": not validation_errors,
        "validation_errors": validation_errors,
        "applied": False,
        "tests": [],
        "status": "proposal-ready",
    }
    if validation_errors:
        result["status"] = "blocked-by-validation"
        append_log(root, "Authorized autonomy blocked", [f"Request: {request}", *validation_errors])
        return result
    if not apply:
        append_log(root, "Authorized autonomy proposal", [f"Request: {request}", "Changes validated but not applied; re-run with --approve."])
        return result
    applied = apply_changes(root, changes)
    commands = discover_test_commands(root)
    test_results = execute_test_commands(root, commands, timeout_seconds=max(1, timeout_seconds))
    test_payload = [item.to_dict() for item in test_results]
    test_ok = all(item.status in {"passed", "not_available"} for item in test_results)
    result.update({
        "ok": test_ok,
        "applied": True,
        "backup_directory": applied["backup_directory"],
        "changed_files": applied["changed_files"],
        "tests": test_payload,
        "status": "verified" if test_ok else "repair-needed",
    })
    append_log(root, "Authorized autonomy completed", [
        f"Request: {request}",
        f"Changed files: {', '.join(applied['changed_files']) or 'none'}",
        f"Backup: {applied['backup_directory']}",
        f"Tests: {', '.join(item.status for item in test_results) or 'not available'}",
        f"Status: {result['status']}",
    ])
    return result
