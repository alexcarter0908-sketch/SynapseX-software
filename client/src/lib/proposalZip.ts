import { strToU8, zipSync } from "fflate";

export type ProposalZipSource = {
  id: number;
  prompt: string;
  createdAt: number;
  analysis: string;
  commands: string[];
  verification: string[];
  risks: string[];
  files: Array<{ path?: string; purpose?: string; content?: string }>;
};

export function safeArchivePath(path: string | undefined) {
  if (!path) return undefined;
  const normalized = path.replace(/\\/g, "/").trim();
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) return undefined;
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return undefined;
  return normalized;
}

export function buildProposalZip(proposal: ProposalZipSource) {
  const entries: Record<string, Uint8Array> = {};
  const manifestFiles: Array<{ path: string; purpose: string }> = [];
  for (const file of proposal.files) {
    const safePath = safeArchivePath(file.path);
    if (!safePath || safePath === "SYNAPSEX-MANIFEST.json") continue;
    entries[safePath] = strToU8(file.content ?? "", true);
    manifestFiles.push({ path: safePath, purpose: file.purpose ?? "Generated artifact" });
  }
  if (!manifestFiles.length) throw new Error("No safe generated files are available to package.");
  entries["SYNAPSEX-MANIFEST.json"] = strToU8(JSON.stringify({
    format: "synapsex-self-run-package-v1",
    generatedAt: new Date(proposal.createdAt).toISOString(),
    request: proposal.prompt,
    summary: proposal.analysis,
    files: manifestFiles,
    commands: proposal.commands,
    verification: proposal.verification,
    safetyNotes: proposal.risks,
  }, null, 2), true);
  return zipSync(entries, { level: 6 });
}
