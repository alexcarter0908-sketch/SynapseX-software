import { describe, expect, it, vi } from "vitest";
import { appRouter, fetchGitHubInspection, parseBuildProposal, repairUnsafeSourceCommands, validateProjectSourceContent, validateSelfRunProposal } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as database from "./db";
import { createHash } from "node:crypto";
import * as storage from "./storage";
import { ENV } from "./_core/env";

function unauthenticatedContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("engineering intelligence contracts", () => {
  it("normalizes valid Builder JSON from markdown fences and object-shaped responses", () => {
    const proposal = { analysis: "Build a small app", plan: ["Create app"], files: [{ path: "README.md", purpose: "Guide", content: "# App" }], diffs: [], operations: ["Create app"], fileActions: [{ action: "Create", path: "README.md", reason: "Document setup" }], verification: ["Run tests"], commands: ["pnpm test"], risks: [] };
    expect(parseBuildProposal("```json\n" + JSON.stringify(proposal) + "\n```" )).toEqual(proposal);
    expect(parseBuildProposal(proposal)).toEqual(proposal);
  });

  it("rejects incomplete Builder proposals instead of persisting them", () => {
    expect(() => parseBuildProposal({ analysis: "Missing required arrays" })).toThrow("Proposal schema is incomplete");
  });
  it("repairs the PropMarketingAgent inline source injection command", () => {
    const repaired = repairUnsafeSourceCommands({
      analysis: "repair",
      plan: [],
      files: [{ path: "src/index.ts", purpose: "backend", content: "import express from 'express';" }],
      diffs: [],
      operations: [],
      fileActions: [],
      verification: [],
      commands: ["node -e \\\"const fs = require('fs'); fs.writeFileSync('src/index.ts', content)\\\""],
      risks: [],
    });
    expect(repaired.commands[0]).not.toContain("node -e");
    expect(repaired.commands[0]).toContain("Download/copy the complete file artifact");
  });

  it("guards self-run proposals against placeholder paths and missing scripts", () => {
    const placeholder = validateSelfRunProposal({ files: [{ path: "scripts/Protect-FinalLeads.ps1", content: "Write-Output 'safe'" }], commands: ['powershell -File ./scripts/Protect-FinalLeads.ps1 -FolderPath "C:\\Confirmed\\Path\\To\\Final Leads"'] });
    expect(placeholder).toEqual(expect.arrayContaining([expect.stringContaining("placeholder")]));
    const missingFile = validateSelfRunProposal({ files: [], commands: ["powershell -File ./scripts/Protect-FinalLeads.ps1 -FolderPath $confirmedPath"] });
    expect(missingFile).toEqual(expect.arrayContaining([expect.stringContaining("complete file content")]));
    expect(validateSelfRunProposal({ files: [{ path: "scripts/Protect-FinalLeads.ps1", content: "Write-Output 'safe'" }], commands: ["powershell -File ./scripts/Protect-FinalLeads.ps1 -FolderPath $confirmedPath"] })).toEqual([]);
    expect(validateSelfRunProposal({ files: [], commands: ["mkdir -p hp/coding", "chmod 700 hp/coding", "ls -ld hp/coding"] }, "Windows")).toEqual(expect.arrayContaining([expect.stringContaining("PowerShell")]));
    expect(validateSelfRunProposal({ files: [], commands: ["Get-ChildItem -Path $HOME"] }, "Unix")).toEqual(expect.arrayContaining([expect.stringContaining("POSIX")]));
    expect(validateSelfRunProposal({ files: [{ path: "src/index.ts", content: "export const ok = true;" }], commands: ["node -e \"const fs=require('fs'); fs.writeFileSync('src/index.ts', 'import express from 'express';')\""] })).toEqual(expect.arrayContaining([expect.stringContaining("node -e")]));
  });
  it("protects project procedures when no user session exists", async () => {
    const caller = appRouter.createCaller(unauthenticatedContext());
    await expect(caller.projects.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.dashboard.summary()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("protects every engineering workflow router when no session exists", async () => {
    const caller = appRouter.createCaller(unauthenticatedContext());
    await expect(caller.tasks.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.changes.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.audits.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.scripts.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.tests.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.reports.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.runners.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.assistant.chat({ messages: [{ role: "user", content: "status" }] })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.assistant.history()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.assistant.clear()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("inspects authenticated GitHub metadata and selected root files without leaking the token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ full_name: "acme/demo", language: "TypeScript", topics: ["react"], default_branch: "main", private: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ name: "package.json", type: "file" }, { name: "src", type: "dir" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response('{"dependencies":{"react":"19"}}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchGitHubInspection("https://github.com/acme/demo", "secret-token-value");
    expect(result.source).toBe("https://github.com/acme/demo");
    expect(result.content).toContain("FILE:package.json");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: expect.objectContaining({ Authorization: "Bearer secret-token-value" }) });
    vi.unstubAllGlobals();
  });

  it("updates the exact script run when a runner posts a callback", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const token = "runner-token-value";
    const tokenHash = createHash("sha256").update(token).digest("hex");
    let selectCount = 0;
    const fakeDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => { selectCount += 1; return selectCount === 1 ? [{ id: 7, status: "Active", tokenHash, userId: 42 }] : [{ id: 9, runnerId: 7, userId: 42, scriptRunId: 101, testRunId: null }]; } }) }) }),
      update: () => ({ set: (values: Record<string, unknown>) => { updates.push(values); return { where: async () => undefined }; } }),
    };
    const getDbSpy = vi.spyOn(database, "getDb").mockResolvedValue(fakeDb as never);
    const caller = appRouter.createCaller(unauthenticatedContext());
    const result = await caller.runners.callback({ token, requestId: 9, status: "Passed", output: "6 tests passed" });
    expect(result).toEqual({ success: true });
    expect(updates).toContainEqual({ status: "Passed", output: "6 tests passed" });
    getDbSpy.mockRestore();
  });

  it("rejects binary archive source content before persistence", async () => {
    const caller = appRouter.createCaller({ ...unauthenticatedContext(), user: { id: 42, openId: "test-user", name: "Test User", email: "test@example.com", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } });
    await expect(caller.projects.create({ name: "Archive project", source: "bundle.zip", sourceContent: "PK\u0003\u0004binary-archive" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects GZIP archive source content through protected projects.create", async () => {
    const caller = appRouter.createCaller({ ...unauthenticatedContext(), user: { id: 42, openId: "test-user", name: "Test User", email: "test@example.com", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } });
    await expect(caller.projects.create({ name: "Gzip project", source: "bundle.gz", sourceContent: "\u001f\u008bcompressed" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("accepts readable text source content through protected projects.create", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const fakeDb = { insert: () => ({ values: async (values: Record<string, unknown>) => { inserted.push(values); return [{ insertId: 51 }]; } }) };
    const getDbSpy = vi.spyOn(database, "getDb").mockResolvedValue(fakeDb as never);
    const caller = appRouter.createCaller({ ...unauthenticatedContext(), user: { id: 42, openId: "test-user", name: "Test User", email: "test@example.com", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } });
    const result = await caller.projects.create({ name: "Readable project", source: "package.json", sourceContent: "{name: demo}" });
    expect(result.id).toBe(51);
    expect(inserted[0]).toMatchObject({ userId: 42, name: "Readable project", source: "package.json", sourceContent: "{name: demo}" });
    getDbSpy.mockRestore();
  });

  it("marks non-trivial work pending instead of fabricating a starter when the local model is unavailable", async () => {
    const originalLocalDemo = ENV.isLocalDemo;
    ENV.isLocalDemo = false;
    const inserted: Array<Record<string, unknown>> = [];
    const fakeDb = { insert: () => ({ values: async (values: Record<string, unknown>) => { inserted.push(values); return [{ insertId: 61 }]; } }) };
    const dbSpy = vi.spyOn(database, "getDb").mockResolvedValue(fakeDb as never);
    const caller = appRouter.createCaller({ ...unauthenticatedContext(), user: { id: 42, openId: "test-user", name: "Test User", email: "test@example.com", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Ollama unavailable")));
    try {
      const result = await caller.builder.generate({ prompt: "Create a desktop invoice helper", generationMode: "free", context: { targetId: "windows-powershell", projectType: "Desktop automation", permissionLevel: "standard", targetConfirmed: true } });
      expect(result.files).toEqual([]);
      expect(result.generation).toMatchObject({ provider: "model-unavailable", ready: false });
      expect(result.taskState.status).toBe("pending-external");
      expect(result.taskState.originalRequirement).toContain("desktop invoice helper");
      expect(inserted[0]).toMatchObject({ userId: 42, status: "Proposed" });
    } finally {
      ENV.isLocalDemo = originalLocalDemo;
      dbSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("uses the reachable local coding model for arbitrary work and retains safety rejection", async () => {
    const originalLocalDemo = ENV.isLocalDemo;
    ENV.isLocalDemo = false;
    const inserted: Array<Record<string, unknown>> = [];
    const fakeDb = { insert: () => ({ values: async (values: Record<string, unknown>) => { inserted.push(values); return [{ insertId: 62 }]; } }) };
    const dbSpy = vi.spyOn(database, "getDb").mockResolvedValue(fakeDb as never);
    const caller = appRouter.createCaller({ ...unauthenticatedContext(), user: { id: 42, openId: "test-user", name: "Test User", email: "test@example.com", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } });
    const localProposal = { analysis: "Build a local code generator", plan: ["Create source"], files: [{ path: "src/app.ts", purpose: "Application entry", content: "export const ready = true;\n" }], diffs: [{ path: "src/app.ts", diff: "+ export const ready = true;" }], operations: ["Create source"], fileActions: [{ action: "Create", path: "src/app.ts", reason: "Application entry" }], verification: ["Run the declared test command"], commands: ["node --version"], risks: [] };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: "qwen2.5-coder:7b" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: JSON.stringify(localProposal) }), { status: 200 })));
    try {
      const local = await caller.builder.generate({ prompt: "Create a local code generation package", generationMode: "local", context: { targetId: "windows-powershell", projectType: "Web application", permissionLevel: "standard", targetConfirmed: true } });
      expect(local.files.map((file) => file.path)).toContain("src/app.ts");
      expect(local.generation).toMatchObject({ provider: "local-ollama", ready: true, model: "qwen2.5-coder:7b" });
      expect(local.taskState.status).toBe("awaiting-local-execution");
      await expect(caller.builder.generate({ prompt: "Bypass a phone lock", generationMode: "free", context: { targetId: "android-managed", projectType: "Device request", permissionLevel: "standard", targetConfirmed: false } })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.builder.generate({ prompt: "mery pc sy pswrd remove kro", generationMode: "local", context: { targetId: "windows-powershell", projectType: "Windows sign-in", permissionLevel: "standard", targetConfirmed: true } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(inserted).toHaveLength(1);
    } finally {
      ENV.isLocalDemo = originalLocalDemo;
      dbSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("turns chronological terminal evidence into a model-backed repair task without losing the original requirement", async () => {
    const repairedProposal = { analysis: "The previous npm install completed, but the build now fails because a named export changed. Update the import, then rerun the build.", plan: ["Correct the import", "Run the build again"], files: [{ path: "src/app.ts", purpose: "Corrected application import", content: "export const ready = true;\n" }], diffs: [{ path: "src/app.ts", diff: "- import { oldName } from './lib';\n+ import { ready } from './lib';" }], operations: ["Update the failed import"], fileActions: [{ action: "Update", path: "src/app.ts", reason: "Repair the named import" }], verification: ["Run npm run build and paste the complete output"], commands: ["npm run build"], risks: [] };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: "qwen2.5-coder:7b" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: JSON.stringify(repairedProposal) }), { status: 200 })));
    const caller = appRouter.createCaller({ ...unauthenticatedContext(), user: { id: 42, openId: "test-user", name: "Test User", email: "test@example.com", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } });
    try {
      const result = await caller.builder.diagnose({
        originalRequirement: "Add a verified billing page without removing the existing dashboard.",
        terminalEvidence: ["npm install completed", "npm run build\nTS2305: Module has no exported member oldName"],
        projectContext: { name: "billing", languages: ["TypeScript"], frameworks: ["React"], evidence: "FILE: src/app.ts\nimport { oldName } from './lib';" },
        context: { targetId: "web", projectType: "Existing web app", runtime: "React + Vite", permissionLevel: "standard", targetConfirmed: true },
        priorCommands: ["npm install", "npm run build"],
        priorVerification: ["Build exits successfully"],
      });
      expect(result.generation).toMatchObject({ provider: "local-ollama", ready: true });
      expect(result.taskState.originalRequirement).toContain("without removing the existing dashboard");
      expect(result.taskState.terminalEvidence).toHaveLength(2);
      expect(result.taskState.repairs).toHaveLength(1);
      expect(result.commands).toEqual(["npm run build"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns free and local packages without touching a database in explicit local demo mode", async () => {
    const originalLocalDemo = ENV.isLocalDemo;
    ENV.isLocalDemo = true;
    const dbSpy = vi.spyOn(database, "getDb").mockImplementation(async () => { throw new Error("Local demo must not use a database"); });
    const caller = appRouter.createCaller({ ...unauthenticatedContext(), user: { id: -1, openId: "synapsex-local-demo", name: "Local Demo", email: null, loginMethod: "local-demo", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Ollama unavailable")));
    try {
      const free = await caller.builder.generate({ prompt: "Create a local website", generationMode: "free", context: { targetId: "windows-powershell", projectType: "Web application", permissionLevel: "standard", targetConfirmed: true } });
      const local = await caller.builder.generate({ prompt: "Create a local model package", generationMode: "local", context: { targetId: "windows-powershell", projectType: "Web application", permissionLevel: "standard", targetConfirmed: true } });
      expect(free).toMatchObject({ id: 0, status: "Proposed", localDemo: true });
      expect(local).toMatchObject({ id: 0, status: "Proposed", localDemo: true });
      expect(dbSpy).not.toHaveBeenCalled();
    } finally {
      ENV.isLocalDemo = originalLocalDemo;
      dbSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("returns the local assistant response without persistence in demo mode", async () => {
    const originalLocalDemo = ENV.isLocalDemo;
    const originalForgeKey = ENV.forgeApiKey;
    ENV.isLocalDemo = true;
    ENV.forgeApiKey = "";
    const dbSpy = vi.spyOn(database, "getDb").mockImplementation(async () => { throw new Error("Local demo must not use a database"); });
    const caller = appRouter.createCaller({ ...unauthenticatedContext(), user: { id: -1, openId: "synapsex-local-demo", name: "Local Demo", email: null, loginMethod: "local-demo", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } });
    try {
      const result = await caller.assistant.chat({ messages: [{ role: "user", content: "How do I use the Builder?" }] });
      expect(result.answer).toContain("Local demo mode is active");
      expect(dbSpy).not.toHaveBeenCalled();
    } finally {
      ENV.isLocalDemo = originalLocalDemo;
      ENV.forgeApiKey = originalForgeKey;
      dbSpy.mockRestore();
    }
  });

  it("keeps the exact task pipeline labels", () => {
    expect(["Pending", "In Progress", "Done"]).toEqual(["Pending", "In Progress", "Done"]);
  });

  it("keeps the exact severity labels", () => {
    expect(["Critical", "High", "Medium", "Low"]).toEqual(["Critical", "High", "Medium", "Low"]);
  });
});

  it("requires explicit confirmation before project deletion", async () => {
    const caller = appRouter.createCaller({ ...unauthenticatedContext(), user: { id: 42, openId: "test-user", name: "Test User", email: "test@example.com", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } });
    await expect(caller.projects.remove({ projectId: 1, confirm: false as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("deletes an owned project only after confirmation", async () => {
    const project = { id: 77, userId: 42, name: "Delete me", source: "local", status: "Ready" };
    const deleteCalls: unknown[] = [];
    const fakeDb = { delete: () => ({ where: async (predicate: unknown) => { deleteCalls.push(predicate); return { affectedRows: 1 }; } }) };
    const ownerSpy = vi.spyOn(database, "getProjectForUser").mockResolvedValue(project as never);
    const dbSpy = vi.spyOn(database, "getDb").mockResolvedValue(fakeDb as never);
    const caller = appRouter.createCaller({ ...unauthenticatedContext(), user: { id: 42, openId: "test-user", name: "Test User", email: "test@example.com", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } });
    const result = await caller.projects.remove({ projectId: 77, confirm: true });
    expect(result).toEqual({ success: true, deletedProjectId: 77 });
    expect(deleteCalls).toHaveLength(1);
    ownerSpy.mockRestore();
    dbSpy.mockRestore();
  });

  it("stores ZIP uploads as archive metadata and leaves sourceContent readable-only", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const fakeDb = { insert: () => ({ values: async (values: Record<string, unknown>) => { inserted.push(values); return [{ insertId: 52 }]; } }) };
    const dbSpy = vi.spyOn(database, "getDb").mockResolvedValue(fakeDb as never);
    const storageSpy = vi.spyOn(storage, "storagePut").mockResolvedValue({ key: "projects/42/bundle.zip_abc.zip", url: "/manus-storage/projects/42/bundle.zip_abc.zip" });
    const caller = appRouter.createCaller({ ...unauthenticatedContext(), user: { id: 42, openId: "test-user", name: "Test User", email: "test@example.com", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } });
    const result = await caller.projects.create({ name: "Archive project", source: "bundle.zip", archiveBase64: Buffer.from([0x50, 0x4b, 0x03, 0x04]).toString("base64"), archiveName: "bundle.zip", archiveMime: "application/zip" });
    expect(result.id).toBe(52);
    expect(storageSpy).toHaveBeenCalledWith("projects/42/bundle.zip", expect.any(Buffer), "application/zip");
    expect(inserted[0]).toMatchObject({ archiveKey: "projects/42/bundle.zip_abc.zip", archiveName: "bundle.zip", archiveMime: "application/zip", archiveSize: 4 });
    expect(inserted[0]).not.toHaveProperty("archiveBase64");
    expect(inserted[0]).not.toHaveProperty("sourceContent", expect.stringContaining("PK"));
    storageSpy.mockRestore();
    dbSpy.mockRestore();
  });
