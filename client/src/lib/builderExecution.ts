export type DiscoveryOs = "Windows" | "Unix";
export type ExecutionMode = "undecided" | "runner" | "self";

export function trimForTransport(value: string, maximum: number, marker = "\n\n[Earlier content compacted for the AI request]\n\n") {
  if (maximum <= 0) return "";
  if (value.length <= maximum) return value;
  if (marker.length >= maximum) return value.slice(0, maximum);
  const usable = Math.max(0, maximum - marker.length);
  const head = Math.ceil(usable * 0.68);
  const tail = usable - head;
  return `${value.slice(0, head)}${marker}${tail > 0 ? value.slice(-tail) : ""}`;
}

export function compactChatForTransport(messages: Array<{ role: "user" | "assistant"; content: string }>, perMessage = 7600, total = 18000) {
  const bounded = messages.slice(-20).map((message) => ({ ...message, content: trimForTransport(message.content, perMessage) }));
  const result: Array<{ role: "user" | "assistant"; content: string }> = [];
  let used = 0;
  for (let index = bounded.length - 1; index >= 0; index -= 1) {
    const message = bounded[index];
    const remaining = total - used;
    if (remaining <= 0) break;
    const content = trimForTransport(message.content, Math.min(perMessage, remaining));
    result.unshift({ ...message, content });
    used += content.length;
  }
  return result;
}

export function inferFolderName(prompt: string) {
  const quoted = prompt.match(/["'`]([^"'`]{2,80})["'`]/)?.[1];
  if (quoted) return quoted.trim();
  const beforeFolder = prompt.match(/([A-Za-z0-9][A-Za-z0-9._-]*(?:\s+[A-Za-z0-9][A-Za-z0-9._-]*)?)\s+(?:folder|directory|carpet(?:a)?)\b/i)?.[1];
  if (beforeFolder) return beforeFolder.trim().replace(/^(?:desktop|par|on|in|the)\s+/i, "").replace(/[.,!?]+$/, "");
  const named = prompt.match(/(?:folder|directory|carpet(?:a)?|folder ka naam)\s+(?:named|called|naam se)?\s*([A-Za-z0-9][A-Za-z0-9._ -]{1,79}?)(?=\s+(?:ko|par|me|mein|with|protect|create|banao|ban[a-z]*|$))/i)?.[1];
  return named?.trim().replace(/[.,!?]+$/, "") || "";
}

export function recommendProtection(prompt: string, os: DiscoveryOs) {
  const wantsPassword = /password|pasw(?:o)?rd|pw|lock|protect|secure/i.test(prompt);
  if (wantsPassword) {
    return os === "Windows"
      ? { title: "Recommended: encrypted password-protected container", body: "Windows normal folders par universal password nahi lagata. Files ko encrypted container/archive mein rakhna password goal ke liye zyada munasib hai; existing folder ko change karne se pehle backup aur recovery plan zaroori hai." }
      : { title: "Recommended: encrypted password-protected container", body: "Password goal ke liye encrypted container/archive recommend hota hai. Normal permissions sirf users ko control karti hain, password protection provide nahi karti." };
  }
  return { title: "Recommended: least-privilege access", body: "Aapke goal ke liye system current owner aur allowed users ka access preserve karke unnecessary write/modify access reduce karega." };
}

export function getDiscoveryCommand(os: DiscoveryOs, folderName: string) {
  const safeName = folderName.replace(/'/g, "''");
  return os === "Windows"
    ? `Get-ChildItem -Path $HOME -Directory -Filter '${safeName}' -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName`
    : `find "$HOME" -type d -name '${safeName.replace(/'/g, "'\\''")}' -print 2>/dev/null`;
}

export function nextExecutionMode(seconds: number, currentMode: ExecutionMode) {
  if (currentMode !== "undecided") return { mode: currentMode, seconds };
  if (seconds <= 1) return { mode: "runner" as const, seconds: 15 };
  return { mode: "undecided" as const, seconds: seconds - 1 };
}

export function parsePowerShellPaths(output: string) {
  return Array.from(new Set(output.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[A-Za-z]:/.test(line) || line.startsWith("\\\\"))));
}

export function parseAclAccounts(output: string) {
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = line.match(/^(.+?)\s+(Allow|Deny)\s+(.+)$/i);
    return match ? { account: match[1].trim(), access: match[3].trim(), effect: match[2].toLowerCase() as "allow" | "deny" } : undefined;
  }).filter((entry): entry is { account: string; access: string; effect: "allow" | "deny" } => Boolean(entry));
}

export function getRollbackPreviewCommand(folderPath: string) {
  const escaped = folderPath.replace(/'/g, "''");
  return `Get-Acl -LiteralPath '${escaped}' | Export-Clixml -LiteralPath '${escaped}\\.eua-acl-backup.xml'`;
}

export function getAclPreviewCommand(folderPath: string) {
  const escaped = folderPath.replace(/'/g, "''");
  return `Get-Acl -LiteralPath '${escaped}' | Select-Object Path,Owner,AccessToString`;
}

export function getFolderCommandSet(os: DiscoveryOs, folderPath: string) {
  const escaped = os === "Windows" ? folderPath.replace(/'/g, "''") : folderPath.replace(/'/g, "'\\''");
  return os === "Windows"
    ? [`New-Item -ItemType Directory -Force -Path '${escaped}'`, `Get-Acl -LiteralPath '${escaped}'`, `Get-ChildItem -LiteralPath '${escaped}'`]
    : [`mkdir -p '${escaped}'`, `getfacl '${escaped}'`, `ls -la '${escaped}'`];
}

export function buildExecutionInstructions(mode: ExecutionMode, pathUnknown: boolean, discoveredPath: string, os: DiscoveryOs) {
  const pathPart = pathUnknown
    ? discoveredPath.trim()
      ? `A path was discovered and must be confirmed before protection: ${discoveredPath.trim()}`
      : `Use a safe read-only ${os} discovery command first and require the user to confirm the returned path.`
    : "The user supplied or selected the path; still verify it before changing anything.";
  const osPart = os === "Windows" ? "Target operating system is Windows PowerShell. Return only PowerShell commands; never use chmod, chown, find, or ls -ld." : "Target operating system is Unix shell. Return POSIX shell commands; do not use PowerShell cmdlets.";
  const modePart = mode === "self"
    ? "Return copy/paste-ready commands, verification steps, rollback steps, and never claim execution."
    : mode === "runner"
      ? "Prepare an approval-gated authorized-runner request; do not execute without explicit approval and a registered runner."
      : "Explain both execution modes and do not execute anything.";
  const protection = recommendProtection(`${pathPart} ${modePart}`, os);
  const protectionPart = `Protection recommendation: ${protection.title}. Explain this plainly before generating any change command.`;
  return `${osPart} ${pathPart} ${modePart} ${protectionPart}`;
}
