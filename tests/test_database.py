from pathlib import Path

from uea.database import inspect_migrations


def test_database_check_flags_destructive_migration(tmp_path: Path) -> None:
    root = tmp_path / "workspace"
    migration_dir = root / "migrations"
    migration_dir.mkdir(parents=True)
    (migration_dir / "001_drop.sql").write_text("DROP TABLE users;\n", encoding="utf-8")
    result = inspect_migrations(root)
    assert result["migration_files"] == ["migrations/001_drop.sql"]
    assert result["safe_to_apply"] is False
    assert result["findings"][0]["severity"] == "high"


def test_database_check_allows_non_destructive_migration(tmp_path: Path) -> None:
    root = tmp_path / "workspace"
    migration_dir = root / "migrations"
    migration_dir.mkdir(parents=True)
    (migration_dir / "002_add.sql").write_text("ALTER TABLE users ADD COLUMN name TEXT;\n", encoding="utf-8")
    result = inspect_migrations(root)
    assert result["safe_to_apply"] is True
    assert result["findings"] == []
