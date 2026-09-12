# General-Purpose Engineering Assistant Audit

## Submitted product requirement

SynapseX must take any reasonable software-development request through one continuous loop: understand the original requirement, inspect a selected project when one exists, create an implementation, validate it where possible, issue exact local commands, ingest the user’s terminal evidence, diagnose failures, repair the real cause, and report only verified completion. A response that contains only a starter template, a setup artifact, or a generic explanation is not a completed implementation.

## Evidence found in the previous implementation

| Requirement | Current behavior | Gap |
|---|---|---|
| Any development prompt is understood semantically | `chooseStarterProfile()` selected output mostly from regular-expression profiles such as website, FastAPI, React, database, or PowerShell. | A keyword/profile match can replace the actual request with a generic starter. |
| No fake template is presented as an implementation | `generationMode: free` always called `createFreeFirstArtifactPlan()`; local-model failure returned an Ollama setup artifact. | The primary no-cost path could return a scaffold instead of the requested product. |
| Every request follows a model-backed engineering loop | The live local Ollama request existed only for `generationMode: local`; the simple interface selected `free` for known profiles. | Most familiar requests bypassed the actual model even when a local model was available. |
| Existing projects are inspected before modification | Inspection existed in a separate Projects module. The simplified Prompt-to-Code Studio did not let the user attach/select that project context. | The primary workflow cannot reliably inspect source before proposing a modification. |
| Output is understood and repaired across turns | Browser-local terminal history and a fixed classifier handled a short list of errors. | Unknown build/test/runtime errors were not sent to the engineering model with the original task and project context for a contextual repair. |
| State survives prompt → command → output → repair | Build proposals and browser history held partial data, but no unified task record captured interpreted requirement, command timeline, repairs, pending prerequisites, and final verification state. | The assistant could lose the true task while moving between proposal and troubleshooting. |
| Completion is evidence-based | The current UI has complete/needs-verification/error labels, but they are derived from fixed output patterns. | General success/failure evaluation requires model reasoning plus explicit evidence status, not only pattern matches. |

## Required architectural correction

1. **Universal task contract.** Every prompt creates or continues one task state containing the original brief, interpreted scope, selected project summary, implementation plan, generated files, command sequence, terminal evidence, diagnostics, repair attempts, pending prerequisites, and a status of `planned`, `awaiting-local-execution`, `repairing`, `pending-external`, `verified`, or `blocked`.
2. **Model-first implementation.** For any non-trivial development request, SynapseX must use the configured free local coding model. Deterministic logic remains only for safe primitives, platform detection, validation, and safety gates; it must never substitute a generic starter for a requested implementation.
3. **Truthful model-unavailable state.** If the local model cannot be reached, SynapseX must say that arbitrary implementation is pending a local model and show the exact no-cost setup/health-check action. It must not claim a template is the requested implementation.
4. **Project-context intake.** The simple primary interface must accept a project context or code snapshot for modifications, detect its stack, and include that context in generation and repair requests.
5. **Model-backed repair.** When terminal output is not an immediately recognized prerequisite or success marker, SynapseX must send the original requirement, proposed files/commands, relevant project context, complete chronological terminal log, and remaining verification requirements to the local model for a structured diagnosis and corrected next action.
6. **Evidence-gated completion.** A task becomes verified only after stated verification evidence is returned or independently available. External credentials, login, OAuth, deployment, and local execution are explicit pending states.

## Non-negotiable boundaries

The assistant must remain free-first and local-first, must not claim it can execute commands on the user’s PC, must not fabricate external integration success, must retain explicit confirmation for high-impact changes, and must refuse unauthorized bypass, credential theft, destructive abuse, rooting, or disabling protection controls.
