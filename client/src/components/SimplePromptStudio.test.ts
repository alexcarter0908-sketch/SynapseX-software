import { describe, expect, it } from "vitest";
import { inferGenerationMode, inferRuntime, inferTarget, requiresHighImpactConfirmation, resolveTargetSelection, restoreProposalSelection } from "./SimplePromptStudio";
import { validateTargetRuntimeCompatibility } from "@shared/universalContract";

describe("simple prompt platform inference", () => {
  it("infers the platform from a direct user request and preserves recommendation mode", () => {
    expect(inferTarget("Create a responsive website for my project")).toBe("web");
    expect(inferTarget("Build a FastAPI API with a health endpoint")).toBe("api");
    expect(inferTarget("Write a Windows PowerShell backup script")).toBe("windows-powershell");
    expect(inferTarget("Create a Linux Bash maintenance script")).toBe("linux-bash");
    expect(inferRuntime("Create a React Vite client portal")).toBe("React + Vite");
    expect(inferRuntime("Build a Python invoice tool")).toBe("Python 3.11+");
    expect(inferTarget("Build a Next.js marketing website that describes products using FastAPI")).toBe("web");
    expect(inferRuntime("Build a Next.js marketing website that describes products using FastAPI")).toBe("Next.js + TypeScript");
    expect(resolveTargetSelection("recommend", "Build a Linux Bash maintenance script")).toBe("linux-bash");
  });

  it("honors an explicit target even when prompt wording suggests another platform", () => {
    expect(resolveTargetSelection("linux-bash", "Build a Windows PowerShell backup script")).toBe("linux-bash");
    expect(resolveTargetSelection("python", "Create a web app with React")).toBe("python");
  });

  it("restores the saved target and runtime instead of silently resetting the runtime", () => {
    expect(restoreProposalSelection({ targetId: "linux-bash", runtime: "Bash 5.2" })).toEqual({ targetSelection: "linux-bash", runtime: "Bash 5.2" });
    expect(restoreProposalSelection({})).toEqual({ targetSelection: "recommend", runtime: "" });
  });

  it("rejects contradictory runtime overrides before generation", () => {
    expect(validateTargetRuntimeCompatibility("windows-powershell", "Bash")).toMatchObject({ valid: false });
    expect(validateTargetRuntimeCompatibility("python", "Node.js 20+")).toMatchObject({ valid: false });
    expect(validateTargetRuntimeCompatibility("web", "Next.js + TypeScript")).toEqual({ valid: true });
  });

  it("routes every non-trivial request to the free local coding engine rather than a profile template", () => {
    expect(inferGenerationMode("laptop sleep se wake hone par bhi password maange aur shutdown ke baad on karne par Windows sign-in password maange")).toBe("local");
    expect(inferGenerationMode("Design a custom procurement optimization algorithm for my factory")).toBe("local");
  });

  it("requires an explicit Yes/No confirmation gate only for security-reducing requests", () => {
    expect(requiresHighImpactConfirmation("Haan, mera apna local Windows account hai aur password remove karna hai")).toBe(true);
    expect(requiresHighImpactConfirmation("Sleep se wake par password na maange")).toBe(true);
    expect(requiresHighImpactConfirmation("Implement a FastAPI notes app on port 8012")).toBe(false);
    expect(requiresHighImpactConfirmation("Koi login nahi aur existing file delete na ho")).toBe(false);
  });
});
