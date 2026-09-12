from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Iterable

from .git import inspect_git
from .models import ProjectProfile, relative_path


IGNORED_DIRECTORIES = {
    ".git",
    ".uea",
    "node_modules",
    ".venv",
    "venv",
    "env",
    "__pycache__",
    "target",
    "bin",
    "obj",
    "dist",
    "build",
    ".next",
    ".terraform",
    "vendor",
}

MAX_FILES = 20_000
MAX_TEXT_BYTES = 512_000


def iter_project_files(root: Path) -> Iterable[Path]:
    count = 0
    for current, directories, filenames in os.walk(root):
        directories[:] = sorted(name for name in directories if name not in IGNORED_DIRECTORIES)
        for filename in sorted(filenames):
            if count >= MAX_FILES:
                return
            path = Path(current) / filename
            if path.is_symlink() or not path.is_file():
                continue
            count += 1
            yield path


def read_text(path: Path) -> str:
    try:
        if path.stat().st_size > MAX_TEXT_BYTES:
            return ""
        return path.read_text(encoding="utf-8", errors="ignore")
    except (OSError, UnicodeError):
        return ""


def add_unique(target: list[str], value: str) -> None:
    if value not in target:
        target.append(value)


def detect_project(root: str | Path) -> ProjectProfile:
    project_root = Path(root).expanduser().resolve()
    if not project_root.exists() or not project_root.is_dir():
        raise FileNotFoundError(f"Project directory does not exist: {project_root}")

    profile = ProjectProfile(root=str(project_root))
    files = list(iter_project_files(project_root))
    names = {path.name.lower() for path in files}
    relative_files = {relative_path(project_root, path) for path in files}
    profile.detected_files = sorted(relative_files)[:300]

    if any(path.suffix.lower() == ".py" for path in files) or names.intersection({"pyproject.toml", "requirements.txt", "setup.py", "pipfile"}):
        add_unique(profile.languages, "Python")
    if any(path.suffix.lower() in {".js", ".jsx", ".ts", ".tsx"} for path in files) or "package.json" in names:
        add_unique(profile.languages, "JavaScript/TypeScript")
        add_unique(profile.package_managers, "npm-compatible")
    if "package-lock.json" in names:
        add_unique(profile.package_managers, "npm")
    if "yarn.lock" in names:
        add_unique(profile.package_managers, "Yarn")
    if "pnpm-lock.yaml" in names:
        add_unique(profile.package_managers, "pnpm")
    if "requirements.txt" in names or "setup.py" in names or "pipfile" in names:
        add_unique(profile.package_managers, "pip")
    if "poetry.lock" in names:
        add_unique(profile.package_managers, "Poetry")
    if "uv.lock" in names:
        add_unique(profile.package_managers, "uv")
    if "cargo.toml" in names:
        add_unique(profile.languages, "Rust")
        add_unique(profile.package_managers, "Cargo")
    if "go.mod" in names:
        add_unique(profile.languages, "Go")
        add_unique(profile.package_managers, "Go modules")
    if "pom.xml" in names or "build.gradle" in names or "build.gradle.kts" in names:
        add_unique(profile.languages, "Java/Kotlin")
        add_unique(profile.package_managers, "Maven/Gradle")
    if any(path.suffix.lower() in {".cs", ".csproj", ".sln"} for path in files):
        add_unique(profile.languages, "C#/.NET")
        add_unique(profile.package_managers, "dotnet")
    if "composer.json" in names or any(path.suffix.lower() == ".php" for path in files):
        add_unique(profile.languages, "PHP")
        add_unique(profile.package_managers, "Composer")
    if any(path.suffix.lower() in {".cpp", ".cc", ".cxx", ".h", ".hpp"} for path in files):
        add_unique(profile.languages, "C/C++")
    if any(path.suffix.lower() == ".rb" for path in files) or "gemfile" in names:
        add_unique(profile.languages, "Ruby")
        add_unique(profile.package_managers, "Bundler")

    marker_content = _combined_marker_content(files)
    framework_markers = {
        "React": ["\"react\"", "from 'react'", 'from "react"'],
        "Next.js": ["next.config", '"next"'],
        "Vue": ["\"vue\"", "from 'vue'", 'from "vue"'],
        "Angular": ["@angular/core", "angular.json"],
        "Express": ["\"express\"", "require('express')", 'require("express")'],
        "Django": ["django"],
        "Flask": ["flask"],
        "FastAPI": ["fastapi"],
        "Laravel": ["laravel/framework"],
        "Spring Boot": ["spring-boot"],
        "ASP.NET": ["Microsoft.AspNetCore"],
    }
    for framework, markers in framework_markers.items():
        if any(marker.lower() in marker_content.lower() for marker in markers):
            add_unique(profile.frameworks, framework)

    for database, markers in {
        "PostgreSQL": ["postgres", "postgresql", "psycopg", "npgsql"],
        "MySQL": ["mysql", "pymysql", "mysql2"],
        "MongoDB": ["mongodb", "pymongo", "mongoose"],
        "Redis": ["redis", "ioredis"],
        "SQLite": ["sqlite", "sqlite3"],
    }.items():
        if any(marker in marker_content.lower() for marker in markers):
            add_unique(profile.databases, database)

    for path in files:
        rel = relative_path(project_root, path)
        lower = rel.lower()
        name = path.name.lower()
        if name in {"dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"}:
            add_unique(profile.configuration_files, rel)
            add_unique(profile.deployment, "Docker/Compose")
        if lower.startswith(".github/workflows/"):
            add_unique(profile.ci_cd, "GitHub Actions")
        if name in {".gitlab-ci.yml", "azure-pipelines.yml", "jenkinsfile"}:
            add_unique(profile.ci_cd, name)
        if name in {".env", ".env.example", ".env.local", "appsettings.json", "application.yml", "application.yaml"}:
            add_unique(profile.configuration_files, rel)
        if "test" in lower or "spec" in lower:
            add_unique(profile.test_indicators, rel)
        if name in {"pytest.ini", "tox.ini", "jest.config.js", "vitest.config.ts", "cypress.config.ts", "playwright.config.ts"}:
            add_unique(profile.test_indicators, rel)

    profile.configuration_files = sorted(profile.configuration_files)
    profile.ci_cd = sorted(profile.ci_cd)
    profile.deployment = sorted(profile.deployment)
    profile.test_indicators = sorted(profile.test_indicators)[:100]
    profile.git = inspect_git(project_root)
    return profile


def _combined_marker_content(files: list[Path]) -> str:
    chunks: list[str] = []
    for path in files:
        if path.name.lower() in {
            "package.json",
            "pyproject.toml",
            "requirements.txt",
            "composer.json",
            "pom.xml",
            "build.gradle",
            "cargo.toml",
            "go.mod",
            "dockerfile",
            "docker-compose.yml",
            "docker-compose.yaml",
        }:
            chunks.append(read_text(path))
    return "\n".join(chunks)


def profile_json(profile: ProjectProfile) -> str:
    return json.dumps(profile.to_dict(), indent=2, ensure_ascii=False)
