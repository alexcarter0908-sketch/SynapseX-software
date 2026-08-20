from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .inspect import iter_project_files
from .models import Finding, relative_path


MIGRATION_HINTS = {"migration", "migrations", "alembic", "prisma", "flyway", "liquibase", "db"}
DESTRUCTIVE_PATTERNS = [
    ("drop_table", r"(?i)\bDROP\s+TABLE\b", "high", "Require an explicit data-loss review and rollback plan before applying."),
    ("drop_column", r"(?i)\bDROP\s+COLUMN\b", "high", "Confirm dependent code and preserve data or provide a migration strategy."),
    ("truncate", r"(?i)\bTRUNCATE\b", "critical", "Do not run against production without explicit authorization and a verified backup."),
    ("delete_without_filter", r"(?i)\bDELETE\s+FROM\s+[A-Za-z0-9_.`\"\[\]]+\s*;", "high", "Require a narrowly scoped predicate or an explicit approved data operation."),
]


def inspect_migrations(root: Path) -> dict[str, Any]:
    files_scanned = 0
    migration_files: list[str] = []
    findings: list[Finding] = []
    for path in iter_project_files(root):
        if not _looks_like_migration(path):
            continue
        migration_files.append(relative_path(root, path))
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        files_scanned += 1
        for number, line in enumerate(text.splitlines(), start=1):
            for name, pattern, severity, recommendation in DESTRUCTIVE_PATTERNS:
                if re.search(pattern, line):
                    findings.append(Finding(
                        severity=severity,
                        category="database_safety",
                        message=f"Potential destructive migration operation: {name.replace('_', ' ')}.",
                        path=relative_path(root, path),
                        line=number,
                        recommendation=recommendation,
                    ))
    return {
        "migration_files": sorted(set(migration_files)),
        "files_scanned": files_scanned,
        "findings": [finding.to_dict() for finding in findings],
        "safe_to_apply": not any(item.severity in {"critical", "high"} for item in findings),
        "verification": "Static inspection only; migration execution was not performed.",
    }


def _looks_like_migration(path: Path) -> bool:
    lowered = str(path).lower().replace("\\", "/")
    suffixes = {".sql", ".py", ".js", ".ts", ".cs", ".java", ".rb", ".php"}
    return path.suffix.lower() in suffixes and any(part in MIGRATION_HINTS for part in lowered.split("/"))
