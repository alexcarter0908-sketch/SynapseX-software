import { describe, expect, it } from "vitest";
import { buildExecutionInstructions, compactChatForTransport, getDiscoveryCommand, getFolderCommandSet, getRollbackPreviewCommand, inferFolderName, parseAclAccounts, recommendProtection, trimForTransport } from "./builderExecution";

describe("builder execution helpers", () => {
  it("bounds oversized transport text while preserving both ends of the content", () => {
    const value = "START-" + "x".repeat(200) + "-END";
    const compacted = trimForTransport(value, 80);
    expect(compacted.length).toBeLessThanOrEqual(80);
    expect(compacted.startsWith("START-")).toBe(true);
    expect(compacted.endsWith("-END")).toBe(true);
  });

  it("compacts chat requests without changing the visible message model", () => {
    const compacted = compactChatForTransport([
      { role: "user", content: "short" },
      { role: "assistant", content: "y".repeat(9000) },
    ], 7600, 8000);
    expect(compacted.at(-1)?.role).toBe("assistant");
    expect(compacted.every((message) => message.content.length <= 7600)).toBe(true);
    expect(compacted.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(8000);
  });

  it("infers folder names from natural-language prompts", () => {
    expect(inferFolderName("Desktop par creatoros-coding folder create kro")).toBe("creatoros-coding");
    expect(inferFolderName("Protect the 'Final Leads' folder with a password")).toBe("Final Leads");
  });

  it("recommends a password-capable protection approach in plain language", () => {
    expect(recommendProtection("Final Leads folder ko password se protect karo", "Windows").title).toContain("encrypted");
    expect(recommendProtection("access ko least privilege karo", "Windows").title).toContain("least-privilege");
  });

  it("parses account-level ACL entries and previews a rollback backup", () => {
    expect(parseAclAccounts("SHERAZI\\hp Allow FullControl\nBUILTIN\\Users Deny Write")).toEqual([
      { account: "SHERAZI\\hp", access: "FullControl", effect: "allow" },
      { account: "BUILTIN\\Users", access: "Write", effect: "deny" },
    ]);
    expect(getRollbackPreviewCommand("C:\\Final Leads")).toContain(".eua-acl-backup.xml");
  });

  it("creates safe Windows and Unix discovery commands", () => {
    expect(getDiscoveryCommand("Windows", "Final Leads")).toContain("Get-ChildItem");
    expect(getDiscoveryCommand("Unix", "Final Leads")).toContain("find");
    expect(getDiscoveryCommand("Windows", "O'Reilly")).toContain("O''Reilly");
  });

  it("keeps folder commands aligned with the selected operating system", () => {
    const windows = getFolderCommandSet("Windows", "C:\\Users\\hp\\coding").join("\\n");
    expect(windows).toContain("New-Item");
    expect(windows).toContain("Get-Acl");
    expect(windows).not.toContain("chmod");
    const unix = getFolderCommandSet("Unix", "/home/hp/coding").join("\\n");
    expect(unix).toContain("mkdir -p");
    expect(unix).toContain("getfacl");
    expect(unix).not.toContain("Get-Acl");
  });

  it("requires path confirmation before protection instructions", () => {
    const discovery = buildExecutionInstructions("self", true, "", "Windows");
    expect(discovery).toContain("read-only Windows discovery");
    expect(discovery).toContain("confirm the returned path");
    const confirmed = buildExecutionInstructions("self", false, "C:\\Final Leads", "Windows");
    expect(confirmed).toContain("copy/paste-ready commands");
    expect(confirmed).toContain("never claim execution");
  });

  it("keeps runner proposals approval-gated", () => {
    expect(buildExecutionInstructions("runner", false, "", "Windows")).toContain("approval-gated");
  });

  it("defaults undecided mode to self-run when the countdown reaches zero", async () => {
    const { nextExecutionMode } = await import("./builderExecution");
    expect(nextExecutionMode(2, "undecided")).toEqual({ mode: "undecided", seconds: 1 });
    expect(nextExecutionMode(1, "undecided")).toEqual({ mode: "self", seconds: 15 });
    expect(nextExecutionMode(1, "self")).toEqual({ mode: "self", seconds: 1 });
  });
});
