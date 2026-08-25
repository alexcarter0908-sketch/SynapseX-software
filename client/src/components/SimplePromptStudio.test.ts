import { describe, expect, it } from "vitest";
import { inferGenerationMode, inferRuntime, inferTarget, requiresHighImpactConfirmation } from "./SimplePromptStudio";

describe("simple prompt platform inference", () => {
  it("infers the platform from a direct user request without exposing manual selectors", () => {
    expect(inferTarget("Create a responsive website for my project")).toBe("web");
    expect(inferTarget("Build a FastAPI API with a health endpoint")).toBe("api");
    expect(inferTarget("Write a Windows PowerShell backup script")).toBe("windows-powershell");
    expect(inferTarget("Create a Linux Bash maintenance script")).toBe("linux-bash");
    expect(inferRuntime("Create a React Vite client portal")).toBe("React + Vite");
    expect(inferRuntime("Build a Python invoice tool")).toBe("Python 3.11+");
    expect(inferTarget("Build a Next.js marketing website that describes products using FastAPI")).toBe("web");
    expect(inferRuntime("Build a Next.js marketing website that describes products using FastAPI")).toBe("Next.js + TypeScript");
  });

  it("defaults every request to the explicit no-model workflow instead of automatically requiring a local model", () => {
    expect(inferGenerationMode("laptop sleep se wake hone par bhi password maange aur shutdown ke baad on karne par Windows sign-in password maange")).toBe("free");
    expect(inferGenerationMode("Design a custom procurement optimization algorithm for my factory")).toBe("free");
  });

  it("requires an explicit Yes/No confirmation gate only for security-reducing requests", () => {
    expect(requiresHighImpactConfirmation("Haan, mera apna local Windows account hai aur password remove karna hai")).toBe(true);
    expect(requiresHighImpactConfirmation("Sleep se wake par password na maange")).toBe(true);
    expect(requiresHighImpactConfirmation("Implement a FastAPI notes app on port 8012")).toBe(false);
    expect(requiresHighImpactConfirmation("Koi login nahi aur existing file delete na ho")).toBe(false);
  });
});
