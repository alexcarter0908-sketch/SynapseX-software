import json
from pathlib import Path

import pytest

from uea.changes import apply_changes, load_changes, validate_changes
from uea.safety import SafetyBoundaryError, resolve_internal_target


def test_external_target_is_blocked(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    home = tmp_path / "uea"
    home.mkdir()
    (home / "pyproject.toml").write_text("[project]\nname='test'\n", encoding="utf-8")
    (home / "src" / "uea").mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    monkeypatch.setenv("UEA_HOME", str(home))
    with pytest.raises(SafetyBoundaryError):
        resolve_internal_target(outside)


def test_change_requires_exact_match_and_creates_backup(tmp_path: Path) -> None:
    root = tmp_path / "workspace"
    root.mkdir()
    target = root / "hello.txt"
    target.write_text("hello old\n", encoding="utf-8")
    spec = root / "change.json"
    spec.write_text(json.dumps({"changes": [{"file": "hello.txt", "find": "old", "replace": "new"}]}), encoding="utf-8")

    changes = load_changes(spec)
    assert validate_changes(root, changes) == []
    result = apply_changes(root, changes)
    assert target.read_text(encoding="utf-8") == "hello new\n"
    backup = Path(str(result["backup_directory"])) / "hello.txt"
    assert backup.read_text(encoding="utf-8") == "hello old\n"


def test_change_validation_rejects_ambiguous_match(tmp_path: Path) -> None:
    root = tmp_path / "workspace"
    root.mkdir()
    (root / "hello.txt").write_text("old old\n", encoding="utf-8")
    changes = load_changes(root / "change.json") if False else []
    from uea.changes import TextChange
    errors = validate_changes(root, [TextChange("hello.txt", "old", "new", expected_matches=1)])
    assert errors
