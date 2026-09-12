from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .git import inspect_git
from .inspect import detect_project
from .changes import apply_changes, load_changes, restore_backup, validate_changes
from .database import inspect_migrations
from .llm import generate_plan, generate_task, render_plan
from .report import append_log, ensure_uea_directory, render_report, write_report
from .runner import discover_test_commands, execute_test_commands
from .security import audit_project
from .safety import SafetyBoundaryError, resolve_internal_file, resolve_internal_target
from .workflow import run_baseline


VERSION = "0.1.0"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="uea",
        description="Universal Engineering Agent — PowerShell-first local project inspection and validation.",
    )
    parser.add_argument("--version", action="version", version=f"UEA {VERSION}")
    subparsers = parser.add_subparsers(dest="command", required=True)

    for name, help_text in [
        ("inspect", "Detect the project technology stack and configuration."),
        ("audit", "Run the baseline redacted security audit."),
        ("status", "Inspect Git branch and working-tree status."),
        ("test", "Discover and execute supported project tests."),
        ("report", "Create a Markdown engineering report."),
        ("plan", "Generate an AI-assisted engineering plan without modifying files."),
        ("task", "Generate an AI-assisted change proposal for the internal workspace."),
        ("change", "Validate or apply a reversible internal workspace change spec."),
        ("rollback", "Preview or restore a timestamped internal workspace backup."),
        ("baseline", "Run the safe inspect-audit-test-report workflow inside the workspace."),
        ("dbcheck", "Inspect internal migration files for destructive database operations."),
        ("init", "Create the project-level .uea artifact directory."),
    ]:
        command = subparsers.add_parser(name, help=help_text)
        command.add_argument("path", nargs="?", default="workspace", help="Internal UEA workspace only; external paths are blocked.")
        command.add_argument("--json", action="store_true", help="Print machine-readable JSON output.")
        command.add_argument("--no-write", action="store_true", help="Do not create or update .uea artifacts.")
        if name == "test":
            command.add_argument("--timeout", type=int, default=300, help="Per-command timeout in seconds.")
        if name in {"plan", "task"}:
            command.add_argument("--request", required=True, help="High-level engineering request to plan.")
            command.add_argument("--model", default=None, help="Optional configured model identifier.")
        if name == "task":
            command.add_argument("--approve", action="store_true", help="Apply the generated proposal after validation and create a backup.")
        if name == "change":
            command.add_argument("--spec", required=True, help="Path to a JSON change spec inside the internal workspace.")
            command.add_argument("--approve", action="store_true", help="Apply the validated change and create a backup.")
        if name == "rollback":
            command.add_argument("--backup", default="latest", help="Backup directory name, or latest.")
            command.add_argument("--approve", action="store_true", help="Restore the selected backup.")
        if name == "baseline":
            command.add_argument("--skip-tests", action="store_true", help="Collect inspection and audit evidence without running tests.")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        root = resolve_internal_target(args.path, create=(args.command == "init"))
        payload = _dispatch(args, root)
        if getattr(args, "json", False):
            print(json.dumps(payload, indent=2, ensure_ascii=False))
        else:
            _print_human(args.command, payload)
        return 0 if payload.get("ok", True) else 1
    except SafetyBoundaryError as exc:
        print(f"UEA safety boundary: {exc}", file=sys.stderr)
        return 3
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"UEA error: {exc}", file=sys.stderr)
        return 2


def _dispatch(args: argparse.Namespace, root: Path) -> dict[str, Any]:
    command = args.command
    if command == "init":
        if args.no_write:
            return {"ok": True, "written": False, "path": str(root / ".uea"), "message": "No-write mode prevented initialization."}
        directory = ensure_uea_directory(root)
        log = append_log(root, "Initialization", ["Created the UEA artifact directory."])
        return {"ok": True, "written": True, "path": str(directory), "engineering_log": str(log)}

    if command == "inspect":
        profile = detect_project(root)
        if not args.no_write:
            append_log(root, "Inspection", [f"Detected languages: {', '.join(profile.languages) or 'none'}", f"Detected frameworks: {', '.join(profile.frameworks) or 'none'}"])
        return {"ok": True, "profile": profile.to_dict()}

    if command == "audit":
        audit = audit_project(root)
        if not args.no_write:
            append_log(root, "Security audit", [f"Scanned {audit.files_scanned} files.", f"Findings: {len(audit.findings)}."])
        return {"ok": True, "audit": audit.to_dict()}

    if command == "dbcheck":
        result = inspect_migrations(root)
        if not args.no_write:
            append_log(root, "Database safety check", [f"Migration files: {len(result['migration_files'])}", f"Findings: {len(result['findings'])}", f"Safe to apply: {result['safe_to_apply']}"])
        return {"ok": True, "database": result}

    if command == "baseline":
        result = run_baseline(root, run_tests=not args.skip_tests, write_artifacts=not args.no_write)
        return {"ok": all(item["status"] in {"passed", "not_available"} for item in result["results"]), **result}

    if command == "change":
        spec_path = resolve_internal_file(root, args.spec)
        if not spec_path.exists():
            raise FileNotFoundError(f"Change spec does not exist inside workspace: {spec_path}")
        changes = load_changes(spec_path)
        errors = validate_changes(root, changes)
        if errors:
            return {"ok": False, "validated": False, "errors": errors}
        if not args.approve:
            return {"ok": True, "validated": True, "applied": False, "message": "Change validated. Re-run with --approve to apply and create a backup.", "files": [item.file for item in changes]}
        result = apply_changes(root, changes)
        append_log(root, "Approved change applied", [f"Changed files: {', '.join(result['changed_files'])}", f"Backup: {result['backup_directory']}"])
        return {"ok": True, "validated": True, "applied": True, **result}

    if command == "rollback":
        result = restore_backup(root, args.backup, approve=args.approve)
        if args.approve:
            append_log(root, "Approved rollback", [f"Backup: {result['backup']}", f"Restored files: {', '.join(result['files'])}"])
        return {"ok": True, "rollback": result}

    if command == "task":
        proposal = generate_task(root, args.request, args.model)
        proposal_path = root / ".uea" / "inbox" / "generated-change.json"
        if not args.no_write:
            proposal_path.parent.mkdir(parents=True, exist_ok=True)
            proposal_path.write_text(json.dumps({"changes": proposal.get("changes", [])}, indent=2, ensure_ascii=False), encoding="utf-8")
        from .changes import TextChange
        typed_changes = [TextChange(**item) for item in proposal.get("changes", [])]
        errors = validate_changes(root, typed_changes)
        if errors:
            return {"ok": False, "proposal": proposal, "validated": False, "errors": errors, "path": str(proposal_path)}
        if not args.approve:
            if not args.no_write:
                append_log(root, "AI task proposal generated", [f"Request: {args.request}", f"Proposal: {proposal_path}", "Applied: false"])
            return {"ok": True, "proposal": proposal, "validated": True, "applied": False, "path": None if args.no_write else str(proposal_path), "message": "Proposal validated. No files were written because --no-write was supplied." if args.no_write else "Proposal validated and saved. Re-run with --approve only after reviewing it."}
        result = apply_changes(root, typed_changes)
        append_log(root, "AI task approved and applied", [f"Request: {args.request}", f"Changed files: {', '.join(result['changed_files'])}", f"Backup: {result['backup_directory']}"])
        return {"ok": True, "proposal": proposal, "validated": True, "applied": True, "path": str(proposal_path), **result}

    if command == "plan":
        plan = generate_plan(root, args.request, args.model)
        profile = detect_project(root)
        content = render_plan(plan, args.request, profile)
        if args.no_write:
            return {"ok": True, "written": False, "plan": plan, "markdown": content}
        path = write_report(root, content)
        append_log(root, "AI plan generated", [f"Request: {args.request}", f"Plan path: {path}"])
        return {"ok": True, "written": True, "path": str(path), "plan": plan, "markdown": content}

    if command == "status":
        status = inspect_git(root)
        if not args.no_write:
            append_log(root, "Git status", [f"Branch: {status.branch or 'unavailable'}", f"Clean: {status.clean}"])
        return {"ok": True, "git": status.to_dict()}

    if command == "test":
        commands = discover_test_commands(root)
        results = execute_test_commands(root, commands, timeout_seconds=max(1, args.timeout))
        if not args.no_write:
            append_log(root, "Test execution", [f"Executed {len(results)} detected test command(s).", f"Statuses: {', '.join(item.status for item in results) or 'none'}"])
        return {
            "ok": all(item.status in {"passed", "not_available"} for item in results),
            "commands": [item.to_dict() for item in commands],
            "results": [item.to_dict() for item in results],
        }

    if command == "report":
        profile = detect_project(root)
        audit = audit_project(root)
        commands = discover_test_commands(root)
        content = render_report(profile, audit, commands)
        if args.no_write:
            return {"ok": True, "written": False, "report": content}
        path = write_report(root, content)
        append_log(root, "Report generated", [f"Report path: {path}"])
        return {"ok": True, "written": True, "path": str(path), "report": content}

    raise ValueError(f"Unsupported command: {command}")


def _print_human(command: str, payload: dict[str, Any]) -> None:
    if command == "inspect":
        profile = payload["profile"]
        print(f"Project: {profile['root']}")
        for label in ["languages", "frameworks", "package_managers", "databases", "ci_cd", "deployment"]:
            values = profile.get(label) or ["none detected"]
            print(f"{label.replace('_', ' ').title()}: {', '.join(values)}")
        print(f"Detected files recorded: {len(profile.get('detected_files', []))}")
    elif command == "audit":
        audit = payload["audit"]
        print(f"Scanned: {audit['files_scanned']} files; skipped: {audit['files_skipped']}")
        print(f"Summary: {audit['summary']}")
        for finding in audit["findings"]:
            location = f"{finding['path']}:{finding['line']}" if finding.get("path") else "project"
            print(f"[{finding['severity'].upper()}] {location} — {finding['message']}")
    elif command == "status":
        status = payload["git"]
        print(f"Git available: {status['available']}")
        print(f"Branch: {status.get('branch') or 'unavailable'}")
        print(f"Clean: {status.get('clean')}")
        for path in status.get("changed_files", []):
            print(f"  {path}")
    elif command == "test":
        for result in payload["results"]:
            print(f"[{result['status'].upper()}] {' '.join(result['command'])} ({result['duration_seconds']}s)")
        if not payload["results"]:
            print("No supported test command detected.")
    elif command == "report":
        if payload.get("written"):
            print(f"Report written to: {payload['path']}")
        else:
            print(payload["report"])
    elif command == "rollback":
        rollback = payload["rollback"]
        print(rollback["message"] if rollback.get("message") else f"Rollback complete: {rollback['backup']}")
        for name in rollback.get("files", []):
            print(f"  {name}")
    elif command == "task":
        if payload.get("applied"):
            print(f"Task applied safely. Backup: {payload['backup_directory']}")
        elif payload.get("validated"):
            print(payload.get("message", "Proposal validated; not applied."))
            print(f"Proposal: {payload['path']}")
        else:
            print("Task proposal validation failed:")
            for error in payload.get("errors", []):
                print(f"  {error}")
    elif command == "plan":
        if payload.get("written"):
            print(f"Plan written to: {payload['path']}")
        else:
            print(payload["markdown"])
    elif command == "dbcheck":
        database = payload["database"]
        print(f"Migration files: {len(database['migration_files'])}")
        print(f"Safe to apply: {database['safe_to_apply']}")
        for finding in database["findings"]:
            print(f"[{finding['severity'].upper()}] {finding['path']}:{finding['line']} — {finding['message']}")
    elif command == "baseline":
        print(f"Baseline complete. Security findings: {len(payload['audit']['findings'])}")
        print(f"Test commands executed: {len(payload['results'])}")
        if payload.get("report_path"):
            print(f"Report: {payload['report_path']}")
    elif command == "change":
        if payload.get("applied"):
            print(f"Applied safely. Backup: {payload['backup_directory']}")
        elif payload.get("validated"):
            print(payload.get("message", "Change validated; not applied."))
            for name in payload.get("files", []):
                print(f"  {name}")
        else:
            print("Change validation failed:")
            for error in payload.get("errors", []):
                print(f"  {error}")
    elif command == "init":
        print(payload.get("message") or f"UEA directory: {payload['path']}")


if __name__ == "__main__":
    raise SystemExit(main())
