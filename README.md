# Universal Engineering Agent

Universal Engineering Agent (UEA) is a local, PowerShell-first software engineering assistant. Phase 1 focuses on safe project inspection, technology detection, security auditing, test discovery and execution, Git awareness, engineering logs, and truthful reports.

The agent is designed to run against a project directory that the user has authorized. It does not silently edit files, discard Git changes, expose credentials, or claim that unverified work succeeded.

## Phase 1 capabilities

| Command | Purpose | Default behavior |
| --- | --- | --- |
| `uea inspect <path>` | Detect languages, frameworks, package managers, databases, CI, Docker, tests, and configuration | Read-only |
| `uea audit <path>` | Scan for likely secrets, dangerous configuration, and common security indicators | Read-only |
| `uea test <path>` | Detect and run the project’s safest available validation command | Executes detected checks |
| `uea status <path>` | Show Git branch, working tree state, and changed files | Read-only |
| `uea report <path>` | Generate a Markdown engineering report from gathered evidence | Writes only to `.uea/` |
| `uea plan <path> --request "..."` | Generate a structured AI-assisted engineering plan | Does not modify source files |
| `uea task [workspace] --request "..."` | Generate an AI change proposal and validate exact edits | Approval required to apply |
| `uea baseline [workspace]` | Run inspect, audit, test discovery, and report generation together | Works only inside the UEA workspace |
| `uea change [workspace] --spec <file> [--approve]` | Validate or apply an exact text change with a timestamped backup | Approval required to write |
| `uea dbcheck [workspace]` | Inspect migration files for destructive operations | Read-only |
| `uea init <path>` | Create the project-level `.uea/` engineering directory | Creates only inside the UEA folder |

The CLI supports `--json` for machine-readable output and `--no-write` for commands that should not create reports or logs. The default target is the agent’s own `workspace` directory. External paths are rejected by the safety boundary rather than inspected.

## Safety model

UEA is workspace-first. By default it operates only inside its own installation directory and its internal `workspace` folder. Paths outside the UEA installation directory are rejected. It never silently scans a user’s home directory or arbitrary projects.

The agent never reads secret values into reports; it reports filenames and locations instead. Test execution is limited to commands detected from project metadata. Code changes require a JSON change specification, exact-match validation, an explicit `--approve` flag, and a timestamped backup under `.uea/backups/`. No unrelated file is eligible for modification through this workflow.

## Installation on Windows

From PowerShell:

```powershell
cd universal-engineering-agent
py -m venv .venv
.\\.venv\\Scripts\\Activate.ps1
python -m pip install -e .
uea --help
```

For development checks:

```powershell
python -m pip install -e .[dev]
pytest
```

## Installation on Linux/macOS for development

```bash
cd universal-engineering-agent
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -e '.[dev]'
pytest
```

## Examples

```powershell
uea init workspace
uea baseline workspace
uea report workspace
uea dbcheck workspace
uea plan workspace --request "Design a safe authentication fix and regression-test plan"
```

AI planning is optional. Install its dependency and configure the provider in PowerShell before using it:

```powershell
python -m pip install -e .[llm]
$env:OPENAI_API_KEY = "<your authorized key>"
$env:OPENAI_API_BASE = "<your OpenAI-compatible endpoint>"
$env:UEA_MODEL = "gpt-5-mini"
```

The plan command is read-only with respect to workspace source files. It may write its Markdown plan and engineering log under the internal `.uea/` directory unless `--no-write` is supplied.

To apply a deliberately prepared reversible change, first validate it without approval:

```powershell
uea change workspace --spec .uea\inbox\change.json
```

Only after reviewing the validation result should an authorized operator apply it. Every applied change gets a timestamped backup before writing.

For an AI-assisted task, the agent first creates a proposal and validates it. It does not apply the proposal unless `--approve` is supplied:

```powershell
uea task workspace --request "Add a health-check endpoint"
uea task workspace --request "Add a health-check endpoint" --approve
```

Database migrations can be checked without running them:

```powershell
uea dbcheck workspace
```

Only after reviewing the validation result should an authorized operator apply it:

```powershell
uea change workspace --spec .uea\inbox\change.json --approve
```

To inspect the machine-readable result:

```powershell
uea inspect C:\\Projects\\my-app --json
```

## Project artifacts

UEA stores its own artifacts in the target project’s `.uea/` directory:

- `engineering.log.md` records observations, actions, results, and limitations.
- `reports/` contains generated Markdown reports.
- `cache/` is reserved for non-sensitive detection metadata.

The `.uea/` directory is created only inside the UEA workspace. Application source files outside the UEA installation are not targets of this Phase 1 workflow.

## Roadmap

The current implementation establishes the isolated workspace, baseline engineering workflow, AI-assisted proposal flow, exact-match reversible changes, migration safety checks, PowerShell wrappers, and truthful reports. The next engineering increment will expand language-specific execution, patch review, rollback tooling, and deeper security validation. A later product phase can add a browser dashboard without moving project access away from the local agent.
