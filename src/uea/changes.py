from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .safety import assert_safe_write_path, resolve_internal_file


@dataclass
class TextChange:
    file: str
    find: str
    replace: str
    expected_matches: int = 1


def load_changes(path: Path) -> list[TextChange]:
    data = json.loads(path.read_text(encoding="utf-8"))
    raw_changes = data.get("changes") if isinstance(data, dict) else data
    if not isinstance(raw_changes, list) or not raw_changes:
        raise ValueError("Change spec must contain a non-empty 'changes' array.")
    changes: list[TextChange] = []
    for item in raw_changes:
        if not isinstance(item, dict):
            raise ValueError("Each change must be an object.")
        file = item.get("file")
        find = item.get("find")
        replace = item.get("replace")
        expected = item.get("expected_matches", 1)
        if not isinstance(file, str) or not file:
            raise ValueError("Each change requires a relative 'file'.")
        if not isinstance(find, str) or not find:
            raise ValueError(f"Change for {file} requires a non-empty 'find' string.")
        if not isinstance(replace, str):
            raise ValueError(f"Change for {file} requires a string 'replace' value.")
        if not isinstance(expected, int) or expected < 1:
            raise ValueError(f"Change for {file} has an invalid expected_matches value.")
        changes.append(TextChange(file=file, find=find, replace=replace, expected_matches=expected))
    return changes


def validate_changes(root: Path, changes: list[TextChange]) -> list[str]:
    errors: list[str] = []
    for change in changes:
        try:
            target = resolve_internal_file(root, change.file)
        except Exception as exc:
            errors.append(f"{change.file}: {exc}")
            continue
        if not target.exists() or not target.is_file():
            errors.append(f"{change.file}: target file does not exist")
            continue
        try:
            content = target.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            errors.append(f"{change.file}: target is not UTF-8 text")
            continue
        matches = content.count(change.find)
        if matches != change.expected_matches:
            errors.append(f"{change.file}: expected {change.expected_matches} match(es), found {matches}")
    return errors


def apply_changes(root: Path, changes: list[TextChange]) -> dict[str, object]:
    errors = validate_changes(root, changes)
    if errors:
        raise ValueError("Change validation failed: " + "; ".join(errors))

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_root = root / ".uea" / "backups" / stamp
    backup_root.mkdir(parents=True, exist_ok=True)
    changed_files: list[str] = []

    for change in changes:
        target = resolve_internal_file(root, change.file)
        assert_safe_write_path(root, target)
        content = target.read_text(encoding="utf-8")
        backup = backup_root / change.file
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_text(content, encoding="utf-8")
        updated = content.replace(change.find, change.replace, change.expected_matches)
        target.write_text(updated, encoding="utf-8")
        changed_files.append(change.file)

    (backup_root / "change-spec.json").write_text(
        json.dumps({"changes": [change.__dict__ for change in changes]}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return {"changed_files": changed_files, "backup_directory": str(backup_root)}


def list_backups(root: Path) -> list[Path]:
    backup_root = root / ".uea" / "backups"
    if not backup_root.exists():
        return []
    return sorted((item for item in backup_root.iterdir() if item.is_dir()), reverse=True)


def restore_backup(root: Path, backup_name: str, *, approve: bool = False) -> dict[str, object]:
    backups = list_backups(root)
    if not backups:
        raise FileNotFoundError("No UEA backups are available.")
    backup = backups[0] if backup_name == "latest" else root / ".uea" / "backups" / backup_name
    if not backup.exists() or not backup.is_dir():
        raise FileNotFoundError(f"Backup does not exist inside the UEA workspace: {backup_name}")
    files = [path for path in backup.rglob("*") if path.is_file() and path.name != "change-spec.json"]
    relative_files = [str(path.relative_to(backup)).replace("\\", "/") for path in files]
    if not approve:
        return {"approved": False, "backup": str(backup), "files": relative_files, "message": "Rollback preview only. Re-run with --approve to restore these files."}
    restored: list[str] = []
    for source in files:
        relative = source.relative_to(backup)
        target = resolve_internal_file(root, str(relative))
        assert_safe_write_path(root, target)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
        restored.append(str(relative).replace("\\", "/"))
    return {"approved": True, "backup": str(backup), "files": restored}
