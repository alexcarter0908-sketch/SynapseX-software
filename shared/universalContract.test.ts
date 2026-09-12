import { describe, expect, it } from "vitest";
import { buildUniversalGenerationContract, chooseStarterProfile, classifyCommandRisk, createFreeFirstArtifactPlan, createLocalModelArtifactPlan, evaluateGenerationEligibility, getExecutionTier, getUniversalTarget, validateTargetRuntimeCompatibility } from "./universalContract";

describe("universal self-run contract", () => {
  it("keeps target-aware runtime instructions aligned for supported targets", () => {
    const cases = [
      ["windows-powershell", "PowerShell 7"],
      ["linux-bash", "Bash"],
      ["macos-zsh", "Zsh"],
      ["python", "Python 3.11+"],
      ["node", "Node.js 20+"],
      ["web", "Node.js 20+"],
      ["api", "Python 3.11+"],
    ] as const;
    for (const [targetId, runtime] of cases) {
      expect(validateTargetRuntimeCompatibility(targetId, runtime)).toEqual({ valid: true });
      const contract = buildUniversalGenerationContract({ targetId, projectType: "Test project", runtime, permissionLevel: "standard", targetConfirmed: false });
      expect(contract).toContain(`Required shell or runtime: ${runtime}.`);
      expect(contract).toContain(`Target: ${getUniversalTarget(targetId).label}`);
    }
  });

  it("rejects only known contradictory shell and runtime combinations", () => {
    expect(validateTargetRuntimeCompatibility("windows-powershell", "Bash")).toMatchObject({ valid: false });
    expect(validateTargetRuntimeCompatibility("linux-bash", "PowerShell 7")).toMatchObject({ valid: false });
    expect(validateTargetRuntimeCompatibility("python", "Node.js 20+")).toMatchObject({ valid: false });
    expect(validateTargetRuntimeCompatibility("node", "Python 3.11+")).toMatchObject({ valid: false });
    expect(validateTargetRuntimeCompatibility("web", "Next.js + TypeScript")).toEqual({ valid: true });
    expect(validateTargetRuntimeCompatibility("api", "Python 3.11+")).toEqual({ valid: true });
    expect(validateTargetRuntimeCompatibility("windows-powershell", "PowerShell 7")).toEqual({ valid: true });
  });

  it("keeps the selected platform syntax and self-run boundary explicit", () => {
    const contract = buildUniversalGenerationContract({ targetId: "windows-powershell", projectType: "Desktop automation", runtime: "FastAPI on Python 3.11", permissionLevel: "standard", targetConfirmed: false });
    expect(contract).toContain("Windows PowerShell");
    expect(contract).toContain("FastAPI on Python 3.11");
    expect(contract).toContain("Self-run is the primary path");
    expect(contract).toContain("not been confirmed");
  });

  it("classifies prohibited and high-impact security requests conservatively", () => {
    expect(classifyCommandRisk("bypass phone lock and root it")).toBe("blocked");
    expect(classifyCommandRisk("root my Android phone")).toBe("blocked");
    expect(classifyCommandRisk("diagnose the root cause of a PowerShell error")).toBe("low");
    expect(classifyCommandRisk("encrypt my authorized USB drive")).toBe("critical");
    expect(classifyCommandRisk("build a website landing page")).toBe("low");
  });

  it("requires owner confirmation for model-enhanced high-impact requests", () => {
    const critical = evaluateGenerationEligibility("model", "encrypt my authorized USB drive", { targetId: "windows-powershell", projectType: "USB security", permissionLevel: "standard", targetConfirmed: false });
    expect(critical.allowed).toBe(false);
    expect(critical.reason).toContain("owner-authorized");
    const allowed = evaluateGenerationEligibility("model", "encrypt my authorized USB drive", { targetId: "windows-powershell", projectType: "USB security", permissionLevel: "owner-confirmed", targetConfirmed: true });
    expect(allowed.allowed).toBe(true);
  });

  it("requires clear local-account ownership confirmation before considering a password-removal request", () => {
    const context = { targetId: "windows-powershell" as const, projectType: "Windows sign-in", permissionLevel: "standard" as const, targetConfirmed: true };
    const withoutConfirmation = evaluateGenerationEligibility("free", "Windows password remove kar do", context);
    expect(withoutConfirmation.allowed).toBe(false);
    expect(withoutConfirmation.reason).toContain("own local Windows account");
    expect(evaluateGenerationEligibility("free", "Haan, mera apna local Windows account hai aur password remove karna hai", context).allowed).toBe(true);
    expect(evaluateGenerationEligibility("local", "mery pc sy pswrd remove kro", context).allowed).toBe(false);
    expect(evaluateGenerationEligibility("free", "Build a FastAPI API with login nahi and existing file delete na ho", context).allowed).toBe(true);
  });

  it("creates a deterministic free-first package without claiming custom execution", () => {
    const plan = createFreeFirstArtifactPlan("Create a Python invoice assistant", { targetId: "python", projectType: "Automation", permissionLevel: "standard", targetConfirmed: true });
    expect(getUniversalTarget("python").label).toBe("Python");
    expect(plan.files.map((file) => file.path)).toContain("README.md");
    expect(plan.analysis).toContain("not required");
    expect(plan.commands).toContain("python --version");
    expect(plan.risks[0]).toContain("does not claim");
  });

  it("includes deterministic starter artifacts for common safe product requests", () => {
    const websiteContext = { targetId: "web" as const, projectType: "Website", permissionLevel: "standard" as const, targetConfirmed: true };
    const website = createFreeFirstArtifactPlan("Create a responsive business website", websiteContext);
    expect(chooseStarterProfile("Create a responsive business website", websiteContext)).toBe("website");
    expect(website.files.map((file) => file.path)).toContain("index.html");
    const fastapi = createFreeFirstArtifactPlan("Build a FastAPI REST API", { targetId: "python", projectType: "API", runtime: "FastAPI", permissionLevel: "standard", targetConfirmed: true });
    expect(fastapi.files.map((file) => file.path)).toContain("app/main.py");
    const baseline = createFreeFirstArtifactPlan("Create an authorized defensive security baseline", { targetId: "windows-powershell", projectType: "Security", permissionLevel: "owner-confirmed", targetConfirmed: true });
    expect(baseline.files.map((file) => file.path)).toContain("scripts/Get-AuthorizedSecurityBaseline.ps1");
    expect(baseline.risks[0]).toContain("Require target confirmation");
  });

  it("routes the submitted SynapseX Ocean Deep showcase brief to a real Next.js website even when product copy mentions FastAPI", () => {
    const brief = `Build SynapseX as an Ocean Deep marketing website. Use Next.js App Router, Tailwind CSS and Framer Motion. Present five products including CreatorOS, CRM, ABot, a Coding Agent and an Engineering Agent. CreatorOS uses FastAPI and PostgreSQL.`;
    const context = { targetId: "web" as const, projectType: "Website", runtime: "Next.js + TypeScript", permissionLevel: "standard" as const, targetConfirmed: true };
    const plan = createFreeFirstArtifactPlan(brief, context);
    expect(chooseStarterProfile(brief, context)).toBe("nextjs-synapsex-showcase");
    expect(getExecutionTier(brief, context)).toBe("deterministic-project");
    expect(plan.files.map((file) => file.path)).toEqual(expect.arrayContaining(["app/page.tsx", "app/products/[slug]/page.tsx", "components/NeuralBackground.tsx", "lib/products.ts", "package.json"]));
    expect(plan.commands).toContain("npm run dev -- --port 3012");
    expect(plan.commands.join("\n")).not.toContain("uvicorn");
    expect(plan.files.find((file) => file.path === "app/globals.css")?.content).toContain("#050f1e");
  });

  it("routes a simple Windows application request to one direct native command instead of a ZIP or local-model workflow", () => {
    const context = { targetId: "windows-powershell" as const, projectType: "Desktop action", permissionLevel: "standard" as const, targetConfirmed: true };
    const plan = createFreeFirstArtifactPlan("open notepad", context);
    expect(chooseStarterProfile("open notepad", context)).toBe("windows-native-command");
    expect(getExecutionTier("open notepad", context)).toBe("direct-native");
    expect(plan.commands).toEqual(["Start-Process -FilePath 'notepad.exe'"]);
    expect(plan.files).toEqual([]);
    expect(plan.files.map((file) => file.path)).not.toContain("RUN-ME-FIRST.ps1");
    expect(plan.analysis).toContain("no ZIP");
  });

  it("includes deterministic Node.js, React, and local database starter packages", () => {
    const node = createFreeFirstArtifactPlan("Create a Node.js local service", { targetId: "node", projectType: "Service", runtime: "Node.js", permissionLevel: "standard", targetConfirmed: true });
    expect(chooseStarterProfile("Create a Node.js local service", { targetId: "node", projectType: "Service", runtime: "Node.js", permissionLevel: "standard", targetConfirmed: true })).toBe("node");
    expect(node.files.map((file) => file.path)).toContain("src/server.mjs");
    const react = createFreeFirstArtifactPlan("Build a React app", { targetId: "web", projectType: "Web app", runtime: "React", permissionLevel: "standard", targetConfirmed: true });
    expect(react.files.map((file) => file.path)).toContain("src/main.jsx");
    const database = createFreeFirstArtifactPlan("Create a local SQLite database application", { targetId: "python", projectType: "Database app", runtime: "Python", permissionLevel: "standard", targetConfirmed: true });
    expect(database.files.map((file) => file.path)).toContain("app.py");
    expect(database.commands).toContain("python app.py");
  });

  it("returns a non-destructive dated ZIP backup script for an explicitly safe authorized PowerShell backup request", () => {
    const prompt = "Mere apne Windows PC ke liye PowerShell mein safe local backup banao. Source folder C:\\Users\\hp\\Documents\\TestProject hoga aur backup folder C:\\Users\\hp\\Documents\\TestBackups hoga. Koi file delete, overwrite, scheduled task create, registry change, ya administrator change na kare.";
    const context = { targetId: "windows-powershell" as const, projectType: "Backup automation", permissionLevel: "standard" as const, targetConfirmed: true };
    const plan = createFreeFirstArtifactPlan(prompt, context);
    expect(classifyCommandRisk(prompt)).toBe("low");
    expect(chooseStarterProfile(prompt, context)).toBe("powershell-backup");
    expect(plan.files.map((file) => file.path)).toContain("scripts/New-DatedProjectBackup.ps1");
    expect(plan.files.find((file) => file.path === "scripts/New-DatedProjectBackup.ps1")?.content).toContain("Compress-Archive");
    expect(plan.commands.join("\n")).toContain("C:\\Users\\hp\\Documents\\TestProject");
    expect(plan.commands.join("\n")).toContain("New-DatedProjectBackup.ps1");
    expect(plan.risks[0]).toContain("does not claim");
  });

  it("keeps distinct compact Windows source and backup paths when English wording appears between them", () => {
    const prompt = "Create a safe PowerShell backup script for C:\\Test\\Source that saves dated ZIP files in C:\\Test\\Backups. Do not delete or overwrite files.";
    const context = { targetId: "windows-powershell" as const, projectType: "Backup automation", permissionLevel: "standard" as const, targetConfirmed: true };
    const plan = createFreeFirstArtifactPlan(prompt, context);
    const commands = plan.commands.join("\n");
    expect(commands).toContain("$sourcePath = 'C:\\Test\\Source'");
    expect(commands).toContain("$backupPath = 'C:\\Test\\Backups'");
  });

  it("returns an executable but bounded protection-layer package for an authorized implementation request", () => {
    const prompt = "Implement an authorized Windows endpoint security protection layer with firewall and Defender enforcement.";
    const context = { targetId: "windows-powershell" as const, projectType: "Security", permissionLevel: "owner-confirmed" as const, targetConfirmed: true };
    const plan = createFreeFirstArtifactPlan(prompt, context);
    const installer = plan.files.find((file) => file.path === "scripts/Install-AuthorizedProtectionLayer.ps1")?.content ?? "";
    expect(chooseStarterProfile(prompt, context)).toBe("security-protection-layer");
    expect(plan.files.map((file) => file.path)).toContain("scripts/Verify-AuthorizedProtectionLayer.ps1");
    expect(plan.commands).not.toContain("& .\\scripts\\Install-AuthorizedProtectionLayer.ps1 -Apply");
    expect(plan.files.find((file) => file.path === "docs/WINDOWS-ZIP-RUN-GUIDE.md")?.content).toContain("Install-AuthorizedProtectionLayer.ps1 -Apply");
    expect(installer).toContain("Set-NetFirewallProfile -Name $_.Name -Enabled True");
    expect(installer).toContain("Set-MpPreference -DisableRealtimeMonitoring $false");
    expect(installer).toContain("Get-Service -Name WinDefend");
    expect(installer).toContain("no Defender preference was changed");
    expect(installer).not.toContain("-Enabled False");
  });

  it("returns an executable Windows sign-in protection package without storing a password", () => {
    const prompt = "On my Windows laptop require a password after sleep wake and after shutdown boot. Implement it safely.";
    const context = { targetId: "windows-powershell" as const, projectType: "Security", permissionLevel: "owner-confirmed" as const, targetConfirmed: true };
    const plan = createFreeFirstArtifactPlan(prompt, context);
    const installer = plan.files.find((file) => file.path === "scripts/Install-RequireSignInAfterWake.ps1")?.content ?? "";
    expect(chooseStarterProfile(prompt, context)).toBe("windows-signin-protection");
    expect(plan.files.map((file) => file.path)).toContain("scripts/Set-LocalAccountPassword.ps1");
    expect(plan.commands).not.toContain("& .\\scripts\\Install-RequireSignInAfterWake.ps1 -Apply");
    expect(installer).toContain("CONSOLELOCK 1");
    expect(installer).toContain("AutoAdminLogon -Value '0'");
    expect(installer).not.toContain("DefaultPassword");
    expect(plan.files.map((file) => file.path)).toContain("RUN-ME-FIRST.ps1");
    expect(plan.files.map((file) => file.path)).toContain("docs/WINDOWS-ZIP-RUN-GUIDE.md");
    expect(plan.files.find((file) => file.path === "docs/WINDOWS-ZIP-RUN-GUIDE.md")?.content).toContain("Install-RequireSignInAfterWake.ps1 -Apply");
    expect(plan.files.find((file) => file.path === "docs/WINDOWS-ZIP-RUN-GUIDE.md")?.content).toContain("synapsex-package-*.zip");
    expect(plan.commands.join("\n")).not.toContain("synapsex-package-*.zip");
  });

  it("recognizes the same Windows sign-in request in Roman Urdu and Hindi", () => {
    const context = { targetId: "windows-powershell" as const, projectType: "Security", permissionLevel: "owner-confirmed" as const, targetConfirmed: true };
    const romanUrdu = "laptop sleep se wake hone par bhi password maange aur shutdown ke baad on karne par Windows sign-in password maange";
    const hindi = "लैपटॉप स्लीप से जागने पर पासवर्ड मांगे और शटडाउन के बाद बूट पर साइन-इन मांगे";
    expect(chooseStarterProfile(romanUrdu, context)).toBe("windows-signin-protection");
    expect(chooseStarterProfile(hindi, context)).toBe("windows-signin-protection");
    expect(createFreeFirstArtifactPlan(romanUrdu, context).files.map((file) => file.path)).toContain("scripts/Install-RequireSignInAfterWake.ps1");
  });

  it("creates a guarded local-account password-removal package only after explicit confirmation", () => {
    const context = { targetId: "windows-powershell" as const, projectType: "Windows sign-in", permissionLevel: "standard" as const, targetConfirmed: true };
    const prompt = "Haan, mera apna local Windows account hai aur password remove karna hai";
    const plan = createFreeFirstArtifactPlan(prompt, context);
    expect(chooseStarterProfile(prompt, context)).toBe("windows-local-password-removal");
    expect(plan.files.map((file) => file.path)).toContain("scripts/Preview-RemoveLocalAccountPassword.ps1");
    expect(plan.files.map((file) => file.path)).toContain("scripts/Restore-LocalAccountPassword.ps1");
    expect(plan.files.find((file) => file.path === "scripts/Remove-LocalAccountPassword.ps1")?.content).toContain("REMOVE LOCAL PASSWORD");
    expect(plan.files.find((file) => file.path === "scripts/Remove-LocalAccountPassword.ps1")?.content).not.toContain("DefaultPassword");
    expect(plan.files.find((file) => file.path === "docs/WINDOWS-ZIP-RUN-GUIDE.md")?.content).toContain("Preview-RemoveLocalAccountPassword.ps1");
    expect(plan.files.find((file) => file.path === "scripts/Preview-RemoveLocalAccountPassword.ps1")?.content.startsWith("param(")).toBe(true);
    expect(plan.files.find((file) => file.path === "scripts/Verify-LocalAccountPasswordRemoval.ps1")?.content.startsWith("param(")).toBe(true);
    expect(plan.files.find((file) => file.path === "scripts/Restore-LocalAccountPassword.ps1")?.content.startsWith("param(")).toBe(true);
    expect(plan.files.map((file) => file.path)).toContain("scripts/Collect-SynapseXDiagnostics.ps1");
    expect(plan.files.find((file) => file.path === "docs/TROUBLESHOOTING.md")?.content).toContain("param is not recognized");
  });

  it("turns a known pasted Windows failure into a read-only diagnostic package", () => {
    const context = { targetId: "windows-powershell" as const, projectType: "Windows troubleshooting", permissionLevel: "standard" as const, targetConfirmed: true };
    const prompt = "param is not recognized in Preview-RemoveLocalAccountPassword.ps1";
    const plan = createFreeFirstArtifactPlan(prompt, context);
    expect(chooseStarterProfile(prompt, context)).toBe("windows-diagnostic");
    expect(plan.files.find((file) => file.path === "docs/DIAGNOSIS.md")?.content).toContain("parameter-order error");
    expect(plan.files.map((file) => file.path)).toContain("scripts/Collect-SynapseXDiagnostics.ps1");
    expect(plan.commands).toContain("& .\\scripts\\Collect-SynapseXDiagnostics.ps1");
  });

  it("returns direct implementation commands in the response while retaining ZIP guidance as an optional artifact file", () => {
    const context = { targetId: "api" as const, projectType: "Local API", permissionLevel: "standard" as const, targetConfirmed: true };
    const plan = createFreeFirstArtifactPlan("Implement a FastAPI notes API on port 8012", context);
    expect(plan.analysis).toContain("Direct implementation prepared");
    expect(plan.commands).toContain("python -m uvicorn app.main:app --reload --port 8012");
    expect(plan.commands.join("\n")).not.toContain("synapsex-package-*.zip");
    expect(plan.commands.join("\n")).not.toContain("node --version");
    expect(plan.files.map((file) => file.path)).toContain("app/main.py");
    expect(plan.files.map((file) => file.path)).not.toContain("scripts/preflight.md");
    expect(plan.files.map((file) => file.path)).not.toContain("docs/EXECUTION-CHECKLIST.md");
  });

  it("prepares a reviewed self-improvement workflow without automatically changing the workspace", () => {
    const context = { targetId: "windows-powershell" as const, projectType: "Software maintenance", permissionLevel: "standard" as const, targetConfirmed: true };
    const plan = createFreeFirstArtifactPlan("Inspect your own SynapseX code and fix yourself with a reviewed proposal", context);
    expect(chooseStarterProfile("Inspect your own SynapseX code and fix yourself with a reviewed proposal", context)).toBe("self-improvement");
    expect(plan.files.map((file) => file.path)).toContain("scripts/Inspect-SynapseXWorkspace.ps1");
    expect(plan.files.find((file) => file.path === "docs/SELF-IMPROVEMENT-WORKFLOW.md")?.content).toContain("does not edit SynapseX automatically");
    expect(plan.commands.join("\n")).toContain("Inspect-SynapseXWorkspace.ps1");
  });

  it("provides an authorized systems-design package for broad physical-system concepts without claiming real-world execution", () => {
    const context = { targetId: "windows-powershell" as const, projectType: "Systems engineering", permissionLevel: "owner-confirmed" as const, targetConfirmed: true };
    const plan = createFreeFirstArtifactPlan("Design a vehicle automation command center for an authorized prototype", context);
    expect(chooseStarterProfile("Design a vehicle automation command center for an authorized prototype", context)).toBe("systems-design");
    expect(plan.files.map((file) => file.path)).toContain("docs/SOLUTION-DESIGN.md");
    expect(plan.files.find((file) => file.path === "docs/SOLUTION-DESIGN.md")?.content).toContain("does not claim to manufacture hardware");
    expect(plan.risks[0]).toContain("Require target confirmation");
  });

  it("creates a runner-free local-model package for supported terminal targets", () => {
    const local = createLocalModelArtifactPlan("Build a CRM dashboard", { targetId: "windows-powershell", projectType: "Web application", permissionLevel: "standard", targetConfirmed: true });
    expect(local.files.map((file) => file.path)).toContain("scripts/generate-with-ollama.ps1");
    expect(local.files.map((file) => file.path)).toContain("RUN-ME-FIRST.ps1");
    expect(local.files.map((file) => file.path)).toContain("docs/WINDOWS-ZIP-RUN-GUIDE.md");
    expect(local.commands.join("\n")).not.toContain("synapsex-package-*.zip");
    expect(local.commands.join("\n")).toContain("& .\\scripts\\generate-with-ollama.ps1");
    expect(local.analysis).toContain("outside SynapseX’s deterministic");
  });
});
