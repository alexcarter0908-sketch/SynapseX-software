import { appendTerminalEvidence, createEngineeringTaskState, markTaskVerified, recordTaskRepair } from "./engineeringTask";
import { describe, expect, it } from "vitest";

describe("universal engineering task state", () => {
  it("preserves the original requirement, implementation, project context, and pending local verification", () => {
    const task = createEngineeringTaskState({
      taskId: "task-1",
      originalRequirement: "Build an inventory API and preserve the current project.",
      analysis: "Create the API using the inspected Node project.",
      target: "Windows PowerShell",
      runtime: "Node.js",
      projectContext: { name: "inventory", frameworks: ["Express"], evidence: "package.json present" },
      plan: ["Inspect existing source", "Add inventory route"],
      files: [{ path: "src/routes/inventory.ts", purpose: "Inventory API route" }],
      commands: ["npm test"],
      verification: ["Call GET /health"],
      now: 100,
    });

    expect(task.status).toBe("awaiting-local-execution");
    expect(task.originalRequirement).toContain("preserve the current project");
    expect(task.interpretation.existingProject).toBe(true);
    expect(task.files[0].path).toBe("src/routes/inventory.ts");
  });

  it("retains chronological evidence and does not mark a task verified without completion evidence", () => {
    const task = createEngineeringTaskState({ taskId: "task-2", originalRequirement: "Fix the build", analysis: "Inspect the compiler error", target: "Windows", plan: [], files: [], commands: ["npm run build"], verification: ["Build exits successfully"], now: 10 });
    const withOutput = appendTerminalEvidence(task, "TS2304: Cannot find name", 20);
    const repaired = recordTaskRepair(withOutput, { observedAt: 20, summary: "Missing type import", nextCommands: ["npm run build"], outcome: "error" }, 30);

    expect(repaired.terminalEvidence).toEqual(["TS2304: Cannot find name"]);
    expect(repaired.repairs).toHaveLength(1);
    expect(repaired.status).toBe("repairing");
    expect(markTaskVerified(repaired, "npm run build exited 0", 40).status).toBe("verified");
  });

  it("keeps model or credential prerequisites explicitly pending instead of fabricating an implementation", () => {
    const task = createEngineeringTaskState({ taskId: "task-3", originalRequirement: "Connect a paid API", analysis: "API credential is required", target: "Web", plan: ["Configure credential"], files: [], commands: [], verification: [], externalPrerequisites: ["User must provide an API credential"], now: 5 });
    expect(task.status).toBe("pending-external");
    expect(task.externalPrerequisites).toContain("User must provide an API credential");
  });
});
