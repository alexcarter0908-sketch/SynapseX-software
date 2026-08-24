export function isExplicitLocalDemoHost(hostname: string, enabled: string | undefined): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname) && enabled === "true";
}

export function isLocalDemo() {
  if (typeof window === "undefined") return false;
  return isExplicitLocalDemoHost(window.location.hostname, import.meta.env.VITE_SYNAPSEX_LOCAL_DEMO);
}
