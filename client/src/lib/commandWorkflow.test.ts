import { analyzeTerminalOutput, appendTerminalOutput, describeCommand } from "./commandWorkflow";
import { describe, expect, it } from "vitest";

describe("command workflow guidance", () => {
  it("explains implementation commands without hiding their expected result", () => {
    expect(describeCommand("python -m uvicorn app.main:app --reload --port 8012").purpose).toContain("Start local API");
    expect(describeCommand("Start-Process -FilePath 'notepad.exe'").purpose).toContain("Open Notepad");
    expect(describeCommand("# Activate .venv").safety).toContain("does not execute");
    expect(describeCommand("node --version").purpose).toContain("Verify Node.js");
    expect(describeCommand("npm install").purpose).toContain("declared dependencies");
    expect(describeCommand("npm run dev -- --port 3012").purpose).toContain("Next.js");
    expect(describeCommand("npm run build").purpose).toContain("production-ready");
    expect(describeCommand('Set-Location "C:\\Users\\hp\\Documents\\own website"').purpose).toContain("workspace");
    expect(describeCommand("winget install --id Ollama.Ollama -e").purpose).toContain("free local coding engine");
    expect(describeCommand("ollama pull qwen2.5-coder:7b").expected).toContain("several gigabytes");
    expect(describeCommand("ollama list").purpose).toContain("Verify the local coding model");
  });

  it("classifies successful, failed, and incomplete terminal evidence", () => {
    expect(analyzeTerminalOutput("Server running on http://localhost:8012", ["Open /health"]).state).toBe("needs-verification");
    expect(analyzeTerminalOutput("The command completed successfully", []).state).toBe("complete");
    expect(analyzeTerminalOutput("ERR_PNPM_EPERM operation not permitted, symlink", []).state).toBe("error");
    expect(analyzeTerminalOutput("Python was not found; run without arguments to install from the Microsoft Store", []).title).toContain("Python runtime");
    expect(analyzeTerminalOutput("Start-Process -FilePath 'notepad.exe'", ["Confirm a Notepad window opened."], ["Start-Process -FilePath 'notepad.exe'"]).title).toContain("launch was requested");
    expect(analyzeTerminalOutput("Package installed", ["Open /health"]).state).toBe("needs-verification");
  });

  it("provides an evidence-based next step for the reported PowerShell param error", () => {
    const assessment = analyzeTerminalOutput("param : The term 'param' is not recognized", []);
    expect(assessment.title).toContain("parameter-order");
    expect(assessment.nextCommands[0]).toContain("Get-Content");
  });

  it("uses chronological evidence to avoid repeating a prerequisite installer after it succeeded", () => {
    const timeline = "Python was not found\nwinget install --id Python.Python.3.12 -e\nFound Python 3.12 [Python.Python.3.12]\nSuccessfully installed";
    const assessment = analyzeTerminalOutput(timeline, ["Open /health"], ["python -m venv .venv", "python -m uvicorn app.main:app --reload --port 8012"]);
    expect(assessment.title).toContain("Python installed");
    expect(assessment.nextCommands.join("\n")).toContain("Close this PowerShell");
    expect(assessment.nextCommands.join("\n")).not.toContain("winget install");
  });

  it("treats an existing Windows Package Manager Python package as a resolved install state", () => {
    const timeline = "Python was not found\nFound an existing package already installed. Trying to upgrade the installed package...\nNo available upgrade found.\nNo newer package versions are available from the configured sources.";
    const assessment = analyzeTerminalOutput(timeline, ["Open /health"], ["python -m venv .venv", "python -m uvicorn app.main:app --reload --port 8012"]);
    expect(assessment.title).toContain("Python installed");
    expect(assessment.nextCommands.join("\n")).toContain("Close this PowerShell");
    expect(assessment.nextCommands.join("\n")).not.toContain("winget install");
  });

  it("retains terminal evidence in chronological order for a repair session", () => {
    const first = appendTerminalOutput([], "Python was not found");
    const second = appendTerminalOutput(first, "Found an existing package already installed\nNo available upgrade found");
    expect(second).toEqual(["Python was not found", "Found an existing package already installed\nNo available upgrade found"]);
    expect(analyzeTerminalOutput(second.join("\n\n--- NEXT TERMINAL OUTPUT ---\n\n"), [], ["python -m venv .venv"]).title).toContain("Python installed");
  });

  it("advances from a successful runtime check using only planned commands", () => {
    const assessment = analyzeTerminalOutput(
      "PS C:\\Users\\hp\\Documents\\own website> python --version\nPython 3.12.10",
      [],
      ["python --version", "python -m venv .venv", ".\\.venv\\Scripts\\Activate.ps1", "pytest"],
      { originalRequirement: "Create hello-engineering Python CLI with tests.", workspaceName: "own website" },
    );
    expect(assessment.state).toBe("needs-verification");
    expect(assessment.nextCommands).toEqual(["python -m venv .venv", ".\\.venv\\Scripts\\Activate.ps1", "pytest"]);
    expect(assessment.nextCommands.join("\\n")).not.toContain("requirements.txt");
  });

  it("uses the latest evidence for a missing file instead of repeating earlier setup commands", () => {
    const timeline = [
      "PS C:\\Users\\hp> python --version\nPython 3.12.10",
      "PS C:\\Users\\hp> python -m venv .venv\nPS C:\\Users\\hp> .\\.venv\\Scripts\\Activate.ps1\n(.venv) PS C:\\Users\\hp> python -m pip install -r requirements.txt\nERROR: Could not open requirements file: [Errno 2] No such file or directory: 'requirements.txt'",
    ].join("\n\n--- NEXT TERMINAL OUTPUT ---\n\n");
    const assessment = analyzeTerminalOutput(
      timeline,
      ["Run the project verification command."],
      ["python --version", "python -m venv .venv", ".\\.venv\\Scripts\\Activate.ps1", "python -m pip install -r requirements.txt"],
      { originalRequirement: "Create hello-engineering Python CLI with tests.", workspaceName: "own website" },
    );
    expect(assessment.state).toBe("error");
    expect(assessment.title).toContain("wrong workspace");
    expect(assessment.nextCommands).toEqual(["Get-Location", "Get-ChildItem -Force", "Test-Path .\\hello-engineering\\pyproject.toml", "Test-Path .\\hello-engineering\\tests"]);
    expect(assessment.nextCommands.join("\n")).not.toContain("pip install");
    expect(assessment.explanation).toContain("hello-engineering");
  });

  it("always provides the first remaining verification command after success", () => {
    const assessment = analyzeTerminalOutput("The command completed successfully", ["pytest", "python -m hello_engineering --name Ada"]);
    expect(assessment.state).toBe("needs-verification");
    expect(assessment.nextCommands).toEqual(["pytest"]);
    expect(assessment.remaining).toEqual(["python -m hello_engineering --name Ada"]);
  });

  it("provides a safe evidence command even when no verification list exists", () => {
    const assessment = analyzeTerminalOutput("PS C:\\Users\\hp> Get-Location");
    expect(assessment.state).toBe("needs-verification");
    expect(assessment.nextCommands).toEqual(["Get-Location"]);
  });
});
