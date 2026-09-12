# SynapseX engineering-assistant workflow

SynapseX chooses the smallest truthful execution path for an authorized request. It does not treat every prompt as a ZIP package or an AI-model task.

| Request class | Execution tier | Response behavior |
|---|---|---|
| Direct native action | `direct-native` | Gives one platform-native command, explains what it does, and asks for visible verification. Example: `open notepad`. |
| Common local project | `deterministic-project` | Gives complete files, setup commands, per-command explanation, local verification, and safe stop guidance. |
| Unfamiliar custom build | `local-model` | Clearly says that a local Ollama model is needed for arbitrary source generation; it does not pretend a generic starter is the requested implementation. |
| High-impact security reduction | `guarded-security` | Requires an explicit Yes/No confirmation before implementation guidance is generated. |

## Closed loop

1. Write the goal in any supported language mix.
2. Review the execution tier and each command’s purpose, expected evidence, and safety boundary.
3. Copy and run one command at a time.
4. Paste complete terminal output into SynapseX.
5. SynapseX classifies success, missing prerequisites, known failures, or insufficient evidence; it then shows the next safe command and remaining verification.
6. Mark a task complete only when the stated verification evidence is present.

SynapseX cannot claim that a command ran on the user’s computer. For unfamiliar requests, a local model can generate custom source, but its output still requires review and verification.
