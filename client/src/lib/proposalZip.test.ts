import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildProposalZip, safeArchivePath } from "./proposalZip";

describe("generated proposal ZIP packages", () => {
  it("preserves safe paths and includes a manifest with commands and verification", () => {
    const archive = buildProposalZip({
      id: 1,
      createdAt: 1_700_000_000_000,
      prompt: "Create a safe backup",
      analysis: "Prepared package",
      commands: ["powershell -File .\\scripts\\backup.ps1"],
      verification: ["Confirm archive exists"],
      risks: ["Review before running"],
      files: [
        { path: "scripts/backup.ps1", purpose: "Backup script", content: "Write-Host 'backup'" },
        { path: "docs/ROLLBACK.md", purpose: "Rollback", content: "Remove only the new archive" },
        { path: "../unsafe.txt", purpose: "Unsafe", content: "never package" },
      ],
    });
    const files = unzipSync(archive);
    expect(strFromU8(files["scripts/backup.ps1"])).toContain("Write-Host");
    expect(files["../unsafe.txt"]).toBeUndefined();
    const manifest = JSON.parse(strFromU8(files["SYNAPSEX-MANIFEST.json"]));
    expect(manifest.commands[0]).toContain("backup.ps1");
    expect(manifest.verification).toContain("Confirm archive exists");
  });

  it("rejects absolute paths and traversal segments", () => {
    expect(safeArchivePath("C:\\Windows\\bad.ps1")).toBeUndefined();
    expect(safeArchivePath("/etc/passwd")).toBeUndefined();
    expect(safeArchivePath("scripts/../bad.ps1")).toBeUndefined();
    expect(safeArchivePath("scripts/good.ps1")).toBe("scripts/good.ps1");
  });
});
