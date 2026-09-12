export type AnalyticsConfig = { endpoint: string; websiteId: string };

export function getAnalyticsConfig(endpoint: string | undefined, websiteId: string | undefined): AnalyticsConfig | undefined {
  const cleanEndpoint = endpoint?.trim().replace(/\/$/, "");
  const cleanWebsiteId = websiteId?.trim();
  if (!cleanEndpoint || !cleanWebsiteId) return undefined;
  if (cleanEndpoint.includes("%") || cleanWebsiteId.includes("%")) return undefined;
  try {
    const url = new URL(cleanEndpoint);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  } catch {
    return undefined;
  }
  return { endpoint: cleanEndpoint, websiteId: cleanWebsiteId };
}

export function mountAnalytics(config: AnalyticsConfig) {
  if (typeof document === "undefined" || document.querySelector("script[data-synapsex-analytics]")) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = `${config.endpoint}/umami`;
  script.dataset.websiteId = config.websiteId;
  script.dataset.synapsexAnalytics = "true";
  document.head.appendChild(script);
}
