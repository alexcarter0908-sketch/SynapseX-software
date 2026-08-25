# pasted_content_18 — Implementation Notes

## Product contract

The user requires a general-purpose AI software-development assistant, not a project-specific generator. It must persist a loop from natural-language requirement to project inspection, implementation, sandbox verification, PowerShell handoff, pasted-output ingestion, success/error classification, repair, and final completion.

## Required state

Each task needs durable records of the original request, interpreted requirement, project profile, execution plan, files changed, generated commands, local output, error/repair history, validation results, pending external dependencies, and final status.

## Existing implementation evidence

The repository already contains two foundations:

1. The Python UEA CLI has conservative internal workspace boundaries (`src/uea/safety.py`), exact-match change backups (`src/uea/changes.py`), optional AI plans/tasks (`src/uea/llm.py`), project inspection, security audit, runner, report, and workflow modules.
2. The React/TypeScript dashboard has routes for projects, tasks, code changes, audits, automation, testing, reports, and assistant. `server/routers.ts` already supports project inspection, structured build proposals, command validation, local-model proposal requests, and a structured engineering task state using `shared/engineeringTask.ts`.

## Upgrade boundaries

Automation must operate only inside explicitly authorized workspaces. New project structures, files, modules, scripts, and tests may be created only inside those allow-listed roots. Secret exposure, bypassing authentication, destructive data operations, external publishing, credential use, and non-allow-listed access must remain protected or pending explicit owner authorization.

## UI expectations

The dashboard should expose: an instruction input, project/workspace context, durable task timeline, plan, generated artifacts, verification results, PowerShell command cards with purpose/expected result, terminal-output intake, explicit outcome classification (`success`, `partial`, `failure`, `needs verification`, `pending`), repair history, and next action.
