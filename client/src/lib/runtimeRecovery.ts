export function isCanceledReason(reason: unknown) {
  if (reason instanceof Error) return reason.name === "CanceledError" || reason.message.toLowerCase().includes("canceled");
  return typeof reason === "string" && reason.toLowerCase().includes("canceled");
}

export function isExternalPreviewSource(filename: string | undefined) {
  return Boolean(filename && /editor\.main\.js|1gki67t5lxyuw\.js|manus\/logs/i.test(filename));
}

export function recoveryMessage(reason: unknown, external = false) {
  if (external || isCanceledReason(reason)) return "Preview connection was canceled or interrupted. Your chat is preserved; reload Assistant and continue from the last visible message.";
  const detail = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "Temporary runtime error";
  return `Assistant safe mode: ${detail.slice(0, 240)} Your saved chat and project data were not deleted.`;
}
