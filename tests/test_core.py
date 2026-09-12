from pathlib import Path

from uea.inspect import detect_project
from uea.runner import discover_test_commands
from uea.security import audit_project


def create_project(tmp_path: Path) -> Path:
    root = tmp_path / "sample"
    root.mkdir()
    (root / "package.json").write_text(
        '{"dependencies":{"react":"18.0.0","express":"4.0.0"},"scripts":{"test":"vitest"}}',
        encoding="utf-8",
    )
    (root / "package-lock.json").write_text("{}", encoding="utf-8")
    (root / "src").mkdir()
    (root / "src" / "main.tsx").write_text("export const App = () => null;", encoding="utf-8")
    (root / ".env.example").write_text("API_URL=https://example.test\n", encoding="utf-8")
    return root


def test_detects_stack_and_configuration(tmp_path: Path) -> None:
    root = create_project(tmp_path)
    profile = detect_project(root)
    assert "JavaScript/TypeScript" in profile.languages
    assert "React" in profile.frameworks
    assert "Express" in profile.frameworks
    assert "npm" in profile.package_managers
    assert ".env.example" in profile.configuration_files


def test_discovers_package_test_command(tmp_path: Path) -> None:
    root = create_project(tmp_path)
    commands = discover_test_commands(root)
    assert any(command.command == ["npm", "test"] for command in commands)


def test_audit_redacts_secret_values(tmp_path: Path) -> None:
    root = create_project(tmp_path)
    (root / "config.py").write_text('API_KEY = "super-secret-value-12345"\n', encoding="utf-8")
    result = audit_project(root)
    assert result.findings
    assert all("super-secret-value" not in finding.message for finding in result.findings)
    assert any(finding.category == "potential_secret" for finding in result.findings)
