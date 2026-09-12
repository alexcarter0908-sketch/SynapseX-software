from __future__ import annotations

import re
from pathlib import Path

from .inspect import IGNORED_DIRECTORIES, iter_project_files
from .models import AuditResult, Finding, relative_path


SECRET_PATTERNS: list[tuple[str, str, str]] = [
    ("private_key", r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", "high"),
    ("aws_access_key", r"\bAKIA[0-9A-Z]{16}\b", "high"),
    ("github_token", r"\bgh[pousr]_[A-Za-z0-9_]{20,}\b", "high"),
    ("generic_secret_assignment", r"(?i)\b(api[_-]?key|secret|token|password)\s*[:=]\s*[\"'][^\"']{8,}[\"']", "high"),
    ("jwt_like_value", r"\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b", "high"),
]

RISK_PATTERNS: list[tuple[str, str, str, str]] = [
    ("tls_verification_disabled", r"(?i)(verify\s*=\s*False|rejectUnauthorized\s*[:=]\s*false)", "high", "Enable certificate verification in production."),
    ("wildcard_cors", r"(?i)(Access-Control-Allow-Origin|allow_origins)\s*[:=].*\*", "medium", "Restrict allowed origins to trusted application domains."),
    ("debug_enabled", r"(?i)\b(DEBUG|debug)\s*[:=]\s*(true|1|yes)", "medium", "Disable debug mode outside local development."),
    ("dangerous_eval", r"\b(eval|exec)\s*\(", "medium", "Avoid dynamic code execution or strictly constrain and validate input."),
    ("shell_injection_risk", r"(?i)(subprocess\.(run|Popen|call)|child_process\.exec)\s*\([^\n]*(shell\s*=\s*True|shell:\s*true)", "high", "Prefer argument arrays and avoid shell interpretation of user input."),
]

BINARY_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".zip", ".7z", ".exe", ".dll", ".so", ".class", ".woff", ".woff2", ".mp3", ".mp4"}


def audit_project(root: str | Path) -> AuditResult:
    project_root = Path(root).expanduser().resolve()
    result = AuditResult(root=str(project_root))
    for path in iter_project_files(project_root):
        if path.suffix.lower() in BINARY_EXTENSIONS:
            result.files_skipped += 1
            continue
        try:
            if path.stat().st_size > 512_000:
                result.files_skipped += 1
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            result.files_skipped += 1
            continue
        result.files_scanned += 1
        rel = relative_path(project_root, path)
        for number, line in enumerate(text.splitlines(), start=1):
            _scan_line(result, rel, number, line)
    return result


def _scan_line(result: AuditResult, rel: str, number: int, line: str) -> None:
    for name, pattern, severity in SECRET_PATTERNS:
        if re.search(pattern, line):
            result.findings.append(Finding(
                severity=severity,
                category="potential_secret",
                message=f"Potential {name.replace('_', ' ')} detected; value redacted.",
                path=rel,
                line=number,
                recommendation="Move the credential to an environment variable or managed secret store, then rotate it if it was real.",
            ))
            break
    for name, pattern, severity, recommendation in RISK_PATTERNS:
        if re.search(pattern, line):
            result.findings.append(Finding(
                severity=severity,
                category="security_configuration",
                message=f"Potential {name.replace('_', ' ')} pattern detected.",
                path=rel,
                line=number,
                recommendation=recommendation,
            ))


def ignored_directories() -> set[str]:
    return set(IGNORED_DIRECTORIES)
