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

export function analyzeTerminalOutput(output: string, verification: string[], commandContext: string[] = []): TerminalAssessment {
  const value = output.trim();
  const lower = value.toLowerCase();
  if (!value) return { state: "needs-verification", title: "No terminal output pasted", explanation: "Paste the complete PowerShell or terminal output after running one command so SynapseX can assess the actual result.", nextCommands: [], remaining: verification };
  const lastPythonMissing = lower.lastIndexOf("python was not found");
  const lastPythonInstall = lower.lastIndexOf("successfully installed");
  const lastExistingPythonPackage = Math.max(lower.lastIndexOf("found an existing package already installed"), lower.lastIndexOf("no available upgrade found"), lower.lastIndexOf("no newer package versions are available"));
  const hasPythonInstallAfterFailure = lastPythonMissing >= 0
    && Math.max(lastPythonInstall, lastExistingPythonPackage) > lastPythonMissing
    && /python\.python|python 3\.\d+|existing package already installed/.test(lower);
  const hasPythonVersion = /(?:^|\n)\s*python\s+3\.\d+(?:\.\d+)?\s*$/im.test(value);
  if (hasPythonVersion && commandContext.some((command) => /uvicorn|python -m venv/i.test(command))) return { state: "needs-verification", title: "Python runtime is available — continue project setup", explanation: "Python now responds in the current terminal. The earlier missing-runtime issue is resolved; do not repeat the installer.", nextCommands: ["python -m venv .venv", ".\\.venv\\Scripts\\Activate.ps1", "python -m pip install -r requirements.txt"], remaining: ["Run these commands from the dedicated workspace that contains the saved implementation files.", "Start the API only after dependency installation completes."] };
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
  if (/error:|exception|failed|cannot find|not recognized/i.test(lower)) return { state: "error", title: "Command reported an error", explanation: "The pasted output contains an error signal. Do not guess or repeat high-impact commands; copy the complete output with the command that produced it.", nextCommands: [], remaining: ["Review the error line and follow the package-specific troubleshooting guide if one exists."] };
  const baselineCommand = commandContext.find((command) => /Get-AuthorizedSecurityBaseline\.ps1/i.test(command));
  const hasInitialPowerShellEvidence = /^\s*PSVersion\s+/im.test(value) && /^\s*Path\s*$/im.test(value);
  if (baselineCommand && hasInitialPowerShellEvidence) return {
    state: "needs-verification",
    title: "PowerShell is ready — run the read-only security baseline",
    explanation: "The pasted output confirms PowerShell and the current working location, but it does not yet contain security-baseline evidence. Continue only from the same folder where SynapseX saved the generated files.",
    nextCommands: [baselineCommand],
    remaining: ["Confirm that .\\scripts\\Get-AuthorizedSecurityBaseline.ps1 exists in the current folder before running it.", "Do not run Install-AuthorizedProtectionLayer.ps1 -Apply. The next command is read-only and only collects baseline evidence.", ...verification],
  };
  if (/server running on|uvicorn running|status["':\s]+ok|the command completed successfully|verifiedat|completed successfully/i.test(lower)) {
    return verification.length
      ? { state: "needs-verification", title: "Current command succeeded — verification remains", explanation: "The pasted output shows this command succeeded, but the task is not complete until the remaining verification evidence is collected.", nextCommands: [], remaining: verification }
      : { state: "complete", title: "Completion evidence detected", explanation: "The pasted output contains success evidence and this task has no remaining automated verification step.", nextCommands: [], remaining: [] };
  }
  if (commandContext.some((command) => /^Start-Process\s+-FilePath/i.test(command)) && /start-process/i.test(lower)) return { state: "needs-verification", title: "Windows application launch was requested", explanation: "Start-Process normally prints no success text. Check visually whether the requested application window opened before treating the task as complete.", nextCommands: [], remaining: verification };
  return { state: "needs-verification", title: "No clear success or failure signal", explanation: "The command may have run, but the output does not prove completion. Run the listed verification step or paste the complete command output.", nextCommands: [], remaining: verification };
}
