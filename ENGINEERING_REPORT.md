# Universal Engineering Agent — Engineering Report

## TASK

Build an elegant, authenticated engineering intelligence platform for inspecting projects, managing engineering tasks, reviewing code changes, auditing security, storing PowerShell/shell scripts, recording testing results, generating reports, and consulting an LLM-powered engineering assistant.

## ANALYSIS

The project was initialized as a full-stack React, Express, tRPC, Drizzle, and Manus-authenticated application. The platform now uses protected procedures for all project-scoped data and a persistent relational model covering projects, tasks, code changes, code-change history, audits, findings, scripts, script runs, test runs, reports, activity, and assistant messages.

Project inspection accepts a linked/path reference or an uploaded text file. Uploaded text is persisted as source content and analyzed for technology indicators. Public GitHub links retrieve repository metadata and selected root configuration files, while the protected `inspectGitHub` procedure supports a caller-supplied GitHub access token for private repositories without persisting or logging that token.

## CHANGES

The dashboard shell and navigation were replaced with a calm engineering command center covering Overview, Projects, Tasks, Code changes, Security audit, Automation, Testing, Reports, and Assistant. The Assistant now uses a viewport-constrained full-screen workspace: the conversation area expands to the available height, long responses remain inside the history viewport, and the bottom composer stays visible. Build from a prompt is a floating optional panel with a pending-approval count and a visible queue of Proposed records awaiting a user or runner. The visual system uses a light workspace, deep navy intelligence surfaces, cyan signal accents, subtle grid texture, structured metadata cards, exact status labels, and exact severity labels.

The backend schema and migrations now include persistent project source content, change review history, runner registrations, execution requests, and exact script-run references. Protected tRPC procedures were added for project creation and inspection, task creation/status/assignment/detail, code-change review, security audits, script storage and run records, test-run records, report generation, prompt-driven builder proposals, and server-side LLM assistant calls. Build proposals persist analysis, project operations, explicit Create/Update/Delete file actions, per-file diffs, verification steps, PowerShell/Shell commands, risks, and Apply/Reject status. The Assistant approvals feed also lists every stored runner execution request with status, updated timestamp, and next actor.

Task workflow supports Pending, In Progress, and Done. Task creation and reassignment are available, and task detail displays proposed diffs plus review events. Code changes support Apply and Reject and persist Created, Applied, and Rejected history events.

Security audit rules inspect supplied project metadata and uploaded source text for secret-like patterns, unsafe HTML or execution sinks, and broad CORS indicators. Reports can be generated as Markdown and downloaded as Markdown or a valid lightweight PDF artifact containing the recorded evidence and explicit verification caveats.

## SECURITY

All feature procedures use authenticated protected procedures and verify project or task ownership before reading or mutating data. A signed-in Manus session gates the workspace and keeps the current chat context in the Assistant view; database records remain user-scoped rather than being shared across accounts. The LLM helper is invoked only on the server. No credentials are invented or placed in source code. Reports and assistant instructions explicitly avoid claiming execution that was not recorded.

The automation and testing interfaces do not execute arbitrary PowerShell, shell commands, or project test suites inside the hosted process. Defensive folder protection can be proposed as code and commands, but the platform does not access local folders automatically and does not implement unauthorized password cracking or bypass workflows. Users can register an authorized runner, receive a one-time token, create Requested execution records, and post token-authenticated Running, Passed, Failed, or Not Verified callbacks. Each execution request links to the exact script run or test run. This avoids exposing the hosted application to unrestricted command execution.

## TESTS

`pnpm check` passed with no TypeScript errors. `pnpm test` passed with 2 test files and 7 tests: the existing logout contract, protected workflow authentication gates, authenticated GitHub metadata and selected-file inspection with token-header verification, exact script-run callback ingestion, exact task pipeline labels, and exact severity labels.

Visual verification passed for the Overview, Projects, Tasks, and Assistant routes at a 1280×720 viewport after restarting the development service.

## VERIFICATION

Verified in the running preview: authenticated dashboard rendering, sidebar navigation, project connection form, upload-reference control, task creation form with assignment field, exact task pipeline columns, assistant empty state, and responsive dashboard composition. Database migrations for the core schema and the source-content/change-history extension executed successfully.

## NOT VERIFIED

The full production build was attempted but was terminated by the sandbox with exit code 143 during Vite chunk rendering under memory pressure. TypeScript and Vitest checks passed independently.

Repository inspection is allowlisted to GitHub and selected root files; arbitrary providers and archive extraction are not supported. Uploaded inspection currently reads text files selected in the browser rather than unpacking arbitrary archives. PowerShell/shell execution and real project test execution remain NOT VERIFIED until a registered runner posts a result callback. Coverage is displayed from recorded test-run data and is not computed by the hosted runtime.

## NEXT STEPS

The application is session-bound: work continues while the active request/session and authorized runner are available, but the hosted web process does not promise ten-hour background execution after the session ends. This boundary is shown beside the pending approvals queue in the Assistant UI. Pending proposals remain persisted with Proposed status and expose the next actor through the Assistant builder queue. Users should approve, reject, export, or connect a runner before treating a proposal as executed.


Connect a narrowly scoped local runner with explicit user authorization for script and test execution, streaming logs and signed result callbacks. Add a repository provider integration for authenticated clone/read operations. Expand Vitest coverage to authenticated database-backed create/update flows when a non-production test database is available. Re-run the production build in a higher-memory build environment before publishing.
