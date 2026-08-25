export type CommandExplanation = {
  purpose: string;
  expected: string;
  safety: string;
};

export type TerminalAssessment = {
  state: "complete" | "error" | "needs-verification";
  title: string;
  explanation: string;
  nextCommands: string[];
  remaining: string[];
};

export type TerminalAnalysisContext = {
  originalRequirement?: string;
  workspaceName?: string;
};

export function appendTerminalOutput(previous: string[], latest: string) {
  const clean = latest.trim();
  if (!clean) return previous;
  return [...previous, clean];
}

export function describeCommand(command: string): CommandExplanation {
  const value = command.trim();
  if (value.startsWith("#")) return { purpose: "Instruction", expected: "Read this note before running the next command.", safety: "This line does not execute a change." };
  if (/^start-process\s+-filepath\s+['"]?notepad\.exe/i.test(value)) return { purpose: "Open Notepad", expected: "A new Notepad window opens.", safety: "This launches only the built-in Notepad application; it does not change files by itself." };
  if (/^start-process\s+-filepath\s+['"]?calc\.exe/i.test(value)) return { purpose: "Open Calculator", expected: "A new Calculator window opens.", safety: "This launches only the built-in Calculator application; it does not change system settings." };
  if (/^start-process\s+-filepath\s+['"]?mspaint\.exe/i.test(value)) return { purpose: "Open Paint", expected: "A new Paint window opens.", safety: "This launches only the built-in Paint application; no files are changed until you explicitly save one." };
  if (/^start-process\s+-filepath\s+['"]?explorer\.exe/i.test(value)) return { purpose: "Open File Explorer", expected: "A File Explorer window opens.", safety: "This launches only File Explorer; review any later file operation separately." };
  if (/^winget\s+install\s+--id\s+python\.python/i.test(value)) return { purpose: "Install Python runtime", expected: "Windows Package Manager downloads and installs the requested Python version.", safety: "Review the package identifier and accept Windows prompts only if you want Python installed." };
  if (/^winget\s+install\s+--id\s+ollama\.ollama/i.test(value)) return { purpose: "Install the free local coding engine", expected: "Windows Package Manager installs Ollama on this computer.", safety: "This installs a local application. It does not send your prompt, project files, or terminal output to a paid cloud provider." };
  if (/^ollama\s+pull\s+/i.test(value)) return { purpose: "Download the selected local coding model", expected: "Ollama downloads the named model and reports completion; the first download can be several gigabytes.", safety: "Confirm enough disk space and a stable internet connection. The model runs locally after download." };
  if (/^ollama\s+list/i.test(value)) return { purpose: "Verify the local coding model is installed", expected: "The installed-model list includes the requested coding model, such as qwen2.5-coder:7b.", safety: "This is read-only; it does not change the model or project files." };
  if (/^ollama\s+--version/i.test(value)) return { purpose: "Verify Ollama is available", expected: "An Ollama version prints in this terminal.", safety: "This is read-only. If Ollama was just installed, open a new PowerShell window before checking." };
  if (/^python\s+--version/i.test(value)) return { purpose: "Verify Python is available", expected: "A Python version such as Python 3.12.x prints in this terminal.", safety: "This is read-only. If Python was just installed, use a new PowerShell window so Windows can refresh PATH." };
  if (/^node\s+--version/i.test(value)) return { purpose: "Verify Node.js runtime is available", expected: "A Node version such as v20.x or v22.x prints in this terminal.", safety: "This is read-only. Do not run dependency commands until a version prints successfully." };
  if (/^npm\s+install\b/i.test(value)) return { purpose: "Install this website's declared dependencies", expected: "npm downloads the packages listed in package.json and finishes without an error.", safety: "Run only inside the selected project workspace after SynapseX has saved the visible files there." };
  if (/^npm\s+run\s+dev\b/i.test(value)) return { purpose: "Start the local Next.js development website", expected: "The terminal remains open and prints a local URL such as http://localhost:3012.", safety: "This starts a local development server only; it does not publish or deploy the website. Stop it with Ctrl+C." };
  if (/^npm\s+run\s+build\b/i.test(value)) return { purpose: "Build the production-ready website bundle", expected: "Next.js compiles the project and exits with a successful build message.", safety: "This validates the saved project but does not deploy it anywhere." };
  if (/^(set-location|cd)\b/i.test(value)) return { purpose: "Enter the selected implementation workspace", expected: "The PowerShell prompt changes to the dedicated project folder.", safety: "Confirm the folder contains the files SynapseX saved before installing dependencies or starting a server." };
  if (/python -m venv/i.test(value)) return { purpose: "Create isolated Python environment", expected: "A .venv folder is created for this project.", safety: "Existing Python installations and other projects are not changed." };
  if (/activate\.ps1|source \.venv/i.test(value)) return { purpose: "Activate project environment", expected: "The current terminal uses this project’s Python packages.", safety: "Only the current terminal session is affected." };
  if (/pip install -r requirements\.txt/i.test(value)) return { purpose: "Install declared dependencies", expected: "Packages listed in requirements.txt are installed into the active environment.", safety: "Review requirements.txt first; this does not modify unrelated project files." };
  if (/uvicorn/i.test(value)) return { purpose: "Start local API server", expected: "The terminal remains running and prints a localhost URL.", safety: "Stop it with Ctrl+C when finished; it does not publish the API to the internet." };
  if (/powercfg/i.test(value)) return { purpose: "Read or update Windows power settings", expected: "Power configuration output or the requested power-setting change is shown.", safety: "Review the exact setting and confirmation requirement before running." };
  if (/preflight/i.test(value)) return { purpose: "Run a preflight check", expected: "Read-only environment information is printed.", safety: "This should not change files or system settings." };
  if (/unblock-file/i.test(value)) return { purpose: "Remove Windows download marking", expected: "The selected local file can be run without the internet-zone block.", safety: "Confirm the file path before running; it does not execute the script." };
  if (/curl|invoke-webrequest/i.test(value)) return { purpose: "Call the local endpoint", expected: "A response verifies that the local service is responding.", safety: "Review the URL; local localhost requests stay on this computer." };
  return { purpose: "Run implementation step", expected: "The terminal should print a success message or a clear error.", safety: "Read the command and its file paths before running." };
}

export function analyzeTerminalOutput(output: string, verification: string[] = [], commandContext: string[] = [], analysisContext: TerminalAnalysisContext = {}): TerminalAssessment {
  const value = output.trim();
  const lower = value.toLowerCase();
  if (!value) return { state: "needs-verification", title: "No terminal output pasted", explanation: "Paste the complete PowerShell or terminal output after running one command so SynapseX can assess the actual result.", nextCommands: verification.slice(0, 1), remaining: verification };
  const segments = value.split(/\n\s*--- NEXT TERMINAL OUTPUT ---\s*\n/i);
  const latestOutput = (segments.at(-1) ?? value).trim();
  const latestLower = latestOutput.toLowerCase();
  const hasPriorEvidence = segments.length > 1;
  const latestLooksLikeError = /error:|exception|failed|cannot find|not recognized|could not open/i.test(latestLower);
  const taskScope = analysisContext.originalRequirement ? `Original request: ${analysisContext.originalRequirement.slice(0, 160)}${analysisContext.originalRequirement.length > 160 ? "…" : ""}` : "Original request and generated command context retained.";
  const plannedAfterPythonCheck = commandContext.filter((command) => !/^python\s+--version\b/i.test(command) && !/^winget\s+install\s+--id\s+python\.python/i.test(command));
  const plannedAfterCommandInOutput = (commands: string[]) => {
    const matchedIndex = commands.reduce((index, command, candidateIndex) => {
      const normalized = command.trim();
      if (!normalized || normalized.startsWith("#")) return index;
      const commandPattern = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\s+/g, "\\s+");
      return new RegExp(commandPattern, "i").test(latestOutput) ? candidateIndex : index;
    }, -1);
    return matchedIndex >= 0 ? commands.slice(matchedIndex + 1).filter((command) => command.trim()) : [];
  };
  if (hasPriorEvidence && latestLooksLikeError && /could not open requirements file|no such file or directory.*requirements\.txt|requirements\.txt.*not found/i.test(latestLower)) {
    const workspaceHint = analysisContext.workspaceName ? ` Selected browser workspace: ${analysisContext.workspaceName}.` : "";
    return { state: "error", title: "Latest step used the wrong workspace or missing dependency file", explanation: `The newest terminal evidence reports that requirements.txt was not found. Earlier Python/venv evidence must not be repeated; first verify the folder and generated files.${workspaceHint} ${taskScope}`, nextCommands: ["Get-Location", "Get-ChildItem -Force", "Test-Path .\\hello-engineering\\pyproject.toml", "Test-Path .\\hello-engineering\\tests"], remaining: ["Paste the complete output of these read-only checks.", "Do not run pip install -r requirements.txt until the expected generated project file is confirmed."] };
  }
  if (hasPriorEvidence && latestLooksLikeError) {
    return { state: "error", title: "Latest terminal step reported an error", explanation: `The newest evidence is the current state; older successful output is not being treated as the next step. ${taskScope}`, nextCommands: ["Get-Location", "Get-ChildItem -Force", "# Paste the complete output together with the command that produced the error."], remaining: ["Resolve the latest error before repeating earlier commands.", ...verification] };
  }
  const lastPythonMissing = lower.lastIndexOf("python was not found");
  const lastPythonInstall = lower.lastIndexOf("successfully installed");
  const lastExistingPythonPackage = Math.max(lower.lastIndexOf("found an existing package already installed"), lower.lastIndexOf("no available upgrade found"), lower.lastIndexOf("no newer package versions are available"));
  const hasPythonInstallAfterFailure = lastPythonMissing >= 0
    && Math.max(lastPythonInstall, lastExistingPythonPackage) > lastPythonMissing
    && /python\.python|python 3\.\d+|existing package already installed/.test(lower);
  const hasPythonVersion = /(?:^|\n)\s*python\s+3\.\d+(?:\.\d+)?\s*$/im.test(value);
  if (hasPythonVersion && commandContext.some((command) => /uvicorn|python -m venv/i.test(command))) {
    const nextCommands = plannedAfterPythonCheck.length ? plannedAfterPythonCheck : ["python -m venv .venv"];
    return { state: "needs-verification", title: "Python runtime is available — continue project setup", explanation: "Python now responds in the current terminal. The earlier missing-runtime issue is resolved; SynapseX is advancing through the generated command list instead of inventing a requirements file.", nextCommands, remaining: ["Run these commands from the dedicated workspace that contains the saved implementation files.", "Paste the complete output after each command so the next step can be selected from the same session."] };
  }
  if (hasPythonInstallAfterFailure) return { state: "needs-verification", title: "Python installed — reopen PowerShell before retrying", explanation: "The pasted timeline shows the Python installer completed after the earlier Python-not-found error. Windows must start a new terminal before the updated PATH can be used.", nextCommands: ["# Close this PowerShell window, open a new one, then run: python --version"], remaining: ["Confirm Python 3.12 (or another installed version) prints before repeating any project command.", "Return to the dedicated implementation workspace before running python -m venv .venv."] };
  if (/python was not found|python.*is not recognized as an internal or external command/i.test(value)) return { state: "error", title: "Python runtime is not installed or not on PATH", explanation: "The FastAPI project did not start because Windows cannot find Python. No project dependency or server command has run successfully yet.", nextCommands: ["winget --version", "winget install --id Python.Python.3.12 -e", "# Close and reopen PowerShell, then run: python --version"], remaining: ["Install Python if winget is available, then reopen PowerShell so PATH refreshes.", "Return to the project folder and repeat: python -m venv .venv"] };
  if (/winget.*is not recognized|winget.*not recognized/i.test(value)) return { state: "error", title: "Windows Package Manager is unavailable", explanation: "SynapseX could not use winget to install the missing prerequisite. The requested application or project has not started yet.", nextCommands: ["Get-Command python -ErrorAction SilentlyContinue", "# Install Python from python.org or Microsoft Store, then reopen PowerShell and run: python --version"], remaining: ["Do not retry the FastAPI command until python --version prints a version number."] };
  if (/address already in use|only one usage of each socket address/i.test(lower)) return { state: "error", title: "Requested local port is already in use", explanation: "The application could not bind to its selected local port because another program is already listening there.", nextCommands: ["Get-NetTCPConnection -LocalPort 8012 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,State,OwningProcess", "# Stop only the confirmed process, or regenerate the project with a different free port."], remaining: ["Confirm which process owns the port before stopping anything.", "Restart the server only after the port is available or a new port is selected."] };
  if (/modulenotfounderror|no module named/i.test(lower)) return { state: "error", title: "Python project dependency is missing", explanation: "Python started, but the active environment does not contain a required package. The server has not started.", nextCommands: [".\\.venv\\Scripts\\Activate.ps1", "python -m pip install -r requirements.txt"], remaining: ["Confirm the command prompt shows the project virtual environment before retrying the server."] };
  if (/param\s*:\s*the term ['"]param['"] is not recognized/i.test(value)) return { state: "error", title: "PowerShell parameter-order error", explanation: "The generated script has an invalid param block position. Do not rerun its apply command. Use a corrected package or corrected script where param(...) is the first executable statement.", nextCommands: ["Get-Content .\\scripts\\Preview-RemoveLocalAccountPassword.ps1 -TotalCount 12"], remaining: ["Confirm param(...) is the first executable statement before running the script again."] };
  if (/err_pnpm_eperm|operation not permitted, symlink/i.test(lower)) return { state: "error", title: "Windows pnpm symlink permission error", explanation: "The dependency installation did not complete because pnpm could not create a symlink. The project is not ready to run yet.", nextCommands: ["corepack pnpm install --frozen-lockfile --config.node-linker=hoisted"], remaining: ["Wait for installation to finish without an error before starting the project."] };
  if (/access is denied/i.test(lower) && /powershell\.exe|program ['"]powershell/i.test(lower)) return { state: "error", title: "Nested PowerShell launch was denied", explanation: "Windows blocked launching a second powershell.exe process. Run the target script directly in the currently open elevated PowerShell window instead of starting a nested PowerShell process.", nextCommands: ["# Example: & .\\scripts\\YourScript.ps1"], remaining: ["Use the exact script path shown by the implementation response."] };
  if (/start-process\s*:.+(cannot find|cannot be run|access is denied)/i.test(value)) return { state: "error", title: "Windows application launch failed", explanation: "PowerShell could not start the requested native application. The direct action is not complete.", nextCommands: ["Get-Command notepad.exe,calc.exe,mspaint.exe,explorer.exe -ErrorAction SilentlyContinue | Select-Object Name,Source"], remaining: ["Confirm the requested Windows application exists before retrying the direct launch command."] };
  if (/is not recognized as an internal or external command/i.test(lower)) return { state: "error", title: "Required command is unavailable", explanation: "Windows could not find the requested runtime or installed project executable. The implementation has not started.", nextCommands: ["Get-Command python,node,corepack -ErrorAction SilentlyContinue"], remaining: ["Install or repair the missing runtime, then repeat the dependency-install step."] };
  if (/error:|exception|failed|cannot find|not recognized/i.test(lower)) {
    const nextSafeCommands = plannedAfterCommandInOutput(commandContext).slice(0, 3);
    return { state: "error", title: "Command reported an error", explanation: "The pasted output contains an error signal. Do not guess or repeat high-impact commands; SynapseX is retaining the original task context and needs a small read-only diagnostic next.", nextCommands: nextSafeCommands.length ? nextSafeCommands : ["Get-Location", "Get-ChildItem -Force"], remaining: ["Review the newest error line before retrying.", "Paste the complete output of the next safe diagnostic.", ...verification] };
  }
  if (/server running on|uvicorn running|status["':\s]+ok|the command completed successfully|verifiedat|completed successfully/i.test(lower)) {
    return verification.length
      ? { state: "needs-verification", title: "Current command succeeded — verification remains", explanation: "The pasted output shows this command succeeded, but the task is not complete until the remaining verification evidence is collected.", nextCommands: verification.slice(0, 1), remaining: verification.slice(1) }
      : { state: "complete", title: "Completion evidence detected", explanation: "The pasted output contains success evidence and this task has no remaining automated verification step.", nextCommands: [], remaining: [] };
  }
  if (commandContext.some((command) => /^Start-Process\s+-FilePath/i.test(command)) && /start-process/i.test(lower)) return { state: "needs-verification", title: "Windows application launch was requested", explanation: "Start-Process normally prints no success text. Check visually whether the requested application window opened before treating the task as complete.", nextCommands: plannedAfterCommandInOutput(commandContext).slice(0, 3), remaining: verification };
  const nextPlannedCommands = plannedAfterCommandInOutput(commandContext).slice(0, 3);
  return { state: "needs-verification", title: "Next evidence is required", explanation: "This output does not prove completion. SynapseX is keeping the original task and command timeline active; run the next safe evidence step or paste the complete command output.", nextCommands: nextPlannedCommands.length ? nextPlannedCommands : verification.length ? [verification[0]] : ["Get-Location"], remaining: verification };
}
