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

  it("moves early PowerShell evidence to the read-only security baseline without proposing apply", () => {
    const baseline = "& .\\scripts\\Get-AuthorizedSecurityBaseline.ps1";
    const assessment = analyzeTerminalOutput(
      "Name                           Value\n----                           -----\nPSVersion                      5.1.22621.2506\nPSEdition                      Desktop\n\nPath\n----\nC:\\Users\\hp",
      ["Paste the full baseline output for review."],
      [baseline, "& .\\scripts\\Install-AuthorizedProtectionLayer.ps1 -Apply"],
    );

    expect(assessment.state).toBe("needs-verification");
    expect(assessment.title).toContain("read-only security baseline");
    expect(assessment.nextCommands).toEqual([baseline]);
    expect(assessment.nextCommands.join("\n")).not.toContain("-Apply");
    expect(assessment.remaining.join("\n")).toContain("Do not run Install-AuthorizedProtectionLayer.ps1 -Apply");
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
});
