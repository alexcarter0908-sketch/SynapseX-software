# SynapseX engineering-assistant acceptance matrix

SynapseX is accepted as an engineering assistant only when the complete user lifecycle works. A generated command, a ZIP, or an isolated unit test is not enough by itself.

| Lifecycle capability | Required behavior | Release evidence |
|---|---|---|
| Prompt interpretation | Infer target and likely runtime without manual selectors, then use the free local coding model for every non-trivial development request. | Prompt-studio tests prove every non-trivial request is sent to the local coding workflow rather than a profile template. |
| Model availability | Report whether the configured free local coding model is reachable and has the requested coding model installed. | The UI displays local-model readiness; unavailable-model regression returns a pending task with no fabricated files. |
| Universal implementation | Generate architecture, files, changes, commands, verification, and risks from the actual brief; do not substitute a generic starter or scaffold. | Server contract tests cover a live structured local-model proposal and reject incomplete model output instead of manufacturing a fallback project. |
| Existing-project inspection | Let the user select an existing project root before a modification request; summarize readable source/configuration evidence and exclude generated/dependency folders. | Browser project-context tests cover stack/dependency detection and evidence preservation. |
| Direct implementation | Show complete files, command sequence, command purpose, expected evidence, safety boundary, verification, and stop/rollback guidance. | Project tests assert expected files and platform-specific commands. |
| Workspace integrity | Save visible files into a user-selected dedicated folder before project commands are copied. | Browser-file-save helper rejects unsafe paths and component locks project command copying until save succeeds. |
| Runtime prerequisites | Detect missing Python, Package Manager, dependency, port, and executable prerequisites. | Terminal-analysis tests cover missing, installed, already-installed, and verified runtime outcomes. |
| Terminal continuity | Preserve terminal output steps, original requirement, selected project context, generated files, commands, repairs, pending work, and verification within one task record. | Shared task-state tests cover chronological evidence, repair history, pending prerequisites, and evidence-gated verified status. |
| Repair loop | Use deterministic prerequisite checks where safe, then send the complete chronological evidence, original requirement, project context, prior commands, and verification requirements to the local coding model for a structured root-cause repair. | Server diagnosis tests prove the original requirement and two terminal outputs survive into a model-backed repair task. |
| Completion | Differentiate command success from verified task completion and never mark completion merely because code was generated. | Task-state tests require explicit completion evidence; server-start evidence remains "needs verification" until health/documentation checks are completed. |
| Safety | Block bypass/rooting/credential theft; require confirmation before security-reducing local-account and wake-sign-in changes. | Classification and confirmation regressions. |
| Pending external work | Credentials, OAuth, login, local model, production deployment, and local-device execution remain explicit pending states. | Model-unavailable and task-state regression coverage. |

## Release boundary

SynapseX treats a prompt as an engineering task, not a template selector. Safe direct native actions may use reviewed deterministic commands; every non-trivial development request requires the configured free local coding model. If that model is unavailable or returns invalid output, SynapseX records a pending state and gives only the exact setup/retry step—never a fabricated starter. SynapseX records verification evidence and never claims execution on the user's computer.
