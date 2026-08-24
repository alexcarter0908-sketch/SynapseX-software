# Universal Self-Run Foundation Validation

## Verified scope

The first universal self-run milestone was validated after the target-aware generation contract, free-first starter package, optional local Ollama package, runtime/framework selector, and defensive-security eligibility rules were added.

| Check | Result |
|---|---|
| Full Vitest suite | Passed: 7 test files and 42 tests. |
| TypeScript | Passed with `pnpm check`. |
| Production bundle | Passed with `pnpm build`. |
| Free-first package | Router regression proves a Windows PowerShell package includes `README.md` and direct preflight commands without a model or runner. |
| Local-model package | Router and shared-contract regressions prove the package supplies the local Ollama script, prompt file, setup guide, and no-runner command flow. |
| Security boundary | Shared and router regressions prove blocked bypass requests are refused and critical model-assisted changes require owner confirmation. |
| Runtime contract | Shared regression proves an explicit runtime/framework such as FastAPI on Python 3.11 is preserved in generated instructions. |

## Known scope boundary

The local-model package creates a self-run workflow for a user-controlled Ollama installation. It does not download a model or run it automatically, and it does not claim that arbitrary custom code has been generated until the user runs the local package and reviews its output. Actual performance and hardware requirements depend on the selected local model.
