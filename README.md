# Universal Engineering Agent

Universal Engineering Agent (UEA) is a local, PowerShell-first software engineering assistant. It supports safe project inspection, technology detection, security auditing, test discovery and execution, Git awareness, engineering logs, truthful reports, and a bounded authorized autonomy loop.

The agent is designed to run against a project directory that the user has authorized. It does not silently edit files, discard Git changes, expose credentials, or claim that unverified work succeeded.

## Capabilities

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
| `uea autonomous [workspace] --request "..."` | Generate, validate, optionally apply reversible internal changes, then run discovered tests | Requires `--approve` to write |
| `uea init <path>` | Create the project-level `.uea/` engineering directory | Creates only inside the UEA folder |

The CLI supports `--json` for machine-readable output and `--no-write` for commands that should not create reports or logs. The default target is the agent’s own `workspace` directory. External paths are rejected by the safety boundary rather than inspected.

## Safety model

UEA is workspace-first. By default it operates only inside its own installation directory and its internal `workspace` folder. Paths outside the UEA installation directory are rejected. It never silently scans a user’s home directory or arbitrary projects.

The agent never reads secret values into reports; it reports filenames and locations instead. Test execution is limited to commands detected from project metadata. Code changes require exact-match validation, a timestamped backup under `.uea/backups/`, and an authorized workspace. No unrelated file is eligible for modification through this workflow.

The authorized autonomy loop can create or modify project files only inside its configured workspace. It deliberately does **not** execute generated shell commands, access external directories, publish deployments, expose secrets, apply database migrations, or run destructive commands. It records the request, proposal, changed files, backup location, tests, and result in the engineering log.

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

### Authorized autonomy on Windows

Use this only after placing the project you want to work on inside the UEA `workspace` directory. The first command produces a proposal without source changes. The second command performs the bounded autonomous loop: it validates its proposed text changes, creates a backup, applies eligible internal changes, discovers supported tests, and records the outcome.

```powershell
cd universal-engineering-agent
.\.venv\Scripts\Activate.ps1

# Expected result: a validated proposal and an engineering-log entry; no source files changed.
uea autonomous workspace --request "Create a new feature module with tests" --json

# Expected result: timestamped backup under workspace\.uea\backups, eligible changes applied, then detected tests run.
uea autonomous workspace --request "Create a new feature module with tests" --approve --json

# Expected result: preview the newest backup; no files restored.
uea rollback workspace --backup latest

# Expected result: restore the newest backup after explicit approval.
uea rollback workspace --backup latest --approve
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

## Development dashboard workflow

The bundled dashboard now supports durable development sessions, explicitly authorized workspace records, terminal-output classification, PowerShell handoff audit entries, blocked/pending/verified session status, and repair-oriented output intake. A user can enter a requirement, inspect an existing project, authorize a selected project path for the session, generate a task state, attach local terminal output, and keep the session open until its final verification state is recorded.

## Roadmap

The current implementation establishes the isolated workspace, baseline engineering workflow, AI-assisted proposal flow, exact-match reversible changes, migration safety checks, PowerShell wrappers, persistent dashboard task sessions, and a bounded authorized autonomy loop. The next engineering increment will expand language-specific execution, patch review, rollback tooling, and deeper security validation.
