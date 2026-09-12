# Windows local demo mode

The packaged application normally uses hosted OAuth and a database. For a self-contained local interface preview, create a `.env.local` file in the project root with the values from `.env.local.example`.

Local demo mode is intentionally opt-in, only runs outside production, and creates no external account, runner, database record, or network model request. It provides an empty-state `Local Demo` identity and allows free deterministic packages and local Ollama packages to be generated for download. Generated output is not persisted after the local server stops.

In PowerShell, use port `3011` because ports `3000`, `8000`, and `5500` are already in use on your computer. First create your local-only configuration file:

```powershell
Copy-Item .env.local.example .env.local -Force
corepack pnpm dev:local
```

Open `http://localhost:3011/assistant` after the server reports that it is running. The `dev:local` command is intentionally cross-platform; it avoids the Windows-incompatible `NODE_ENV=development` script syntax. Keep `.env.local` in place while using local demo mode.
