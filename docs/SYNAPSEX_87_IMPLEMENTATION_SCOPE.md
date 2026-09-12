# SynapseX implementation scope from pasted_content_87.txt

The supplied brief explicitly targets the extracted **SynapseX-software / Universal Engineering Agent** project, not CreatorOS CRM. Preserve the existing authenticated engineering workspace, projects, tasks, code-change review, security audits, automation, testing, reports, Assistant, AI proposals, generated files, PowerShell/self-run flow, approvals, runner model, truthful execution status, and rollback-oriented handling.

The highest-value gap is that generation relies too heavily on free-form prompts. The requested first improvement is an explicit target/environment selector before generation while retaining natural-language prompts in Urdu, Roman Urdu, Hindi, or English. Supported target examples are Windows PowerShell, Linux Bash, macOS Zsh, Python, Node.js, web app, and API. The structured request should carry target, platform, shell/runtime, version when known, project/path context, dependencies, execution mode, verification plan, rollback plan, risk, and authorization assumptions without inventing missing values.

The prompt requests stronger output separation for changes, complete files, commands, preflight, verification, rollback, risk/safety notes, and execution status; first-class PowerShell and Linux Bash support; target-specific preflight; evidence-gated verification and rollback; preserved approval and safety boundaries; no USB/phone modules in this pass; targeted Assistant UX and 390px verification; focused target/contract/unsupported/PowerShell/Bash/preflight/verification/rollback/status tests; and a recoverable checkpoint or patch report.

The actual assessment confirms the existing shared contract already has target IDs for Windows PowerShell, Linux Bash, macOS Zsh, Python, Node.js, web, API, and authorized Android managed devices. The current `SimplePromptStudio.tsx` still infers the target from prompt text and sends that inferred context to `builder.generate`; it already renders mature output sections. The safe first implementation is therefore an explicit selector plus optional runtime/version override wired into the existing context and local response history, without changing database schema, backend safety gates, runner behavior, or output architecture.

Source references used from the local ZIP:
- `SYNAPSEX_PRODUCT_GAP_ASSESSMENT.md`
- `ENGINEERING_REPORT.md`
- `client/src/components/SimplePromptStudio.tsx`
- `shared/universalContract.ts`
- `shared/universalContract.test.ts`
- `server/routers.ts`
