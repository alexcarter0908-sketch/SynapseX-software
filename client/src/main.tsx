import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import { getAnalyticsConfig, mountAnalytics } from "./lib/analytics";
import { isLocalDemo } from "./lib/localDemo";
import "./index.css";
import { isCanceledReason, isExternalPreviewSource, recoveryMessage } from "./lib/runtimeRecovery";

const queryClient = new QueryClient();

const isCanceledError = isCanceledReason;

if (typeof window !== "undefined") {
  const analytics = isLocalDemo() ? undefined : getAnalyticsConfig(import.meta.env.VITE_ANALYTICS_ENDPOINT, import.meta.env.VITE_ANALYTICS_WEBSITE_ID);
  if (analytics) mountAnalytics(analytics);
  const showRuntimeRecovery = (reason: unknown, external = false) => {
    const panel = document.getElementById("runtime-recovery");
    const message = document.getElementById("runtime-recovery-message");
    if (!panel) return;
    const text = recoveryMessage(reason, external);
    if (message) message.textContent = text;
    panel.hidden = false;
    panel.style.display = "grid";
  };
  document.getElementById("runtime-recovery-reload")?.addEventListener("click", () => window.location.reload());
  window.addEventListener("error", (event) => {
    const external = isExternalPreviewSource(String(event.filename ?? ""));
    if (isCanceledError(event.error) || external) {
      showRuntimeRecovery(event.error ?? event.message, external);
      return;
    }
    showRuntimeRecovery(event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isCanceledError(event.reason)) {
      event.preventDefault();
      showRuntimeRecovery(event.reason, true);
      console.warn("[Request canceled] Preview request canceled; recovery controls remain available.");
      return;
    }
    showRuntimeRecovery(event.reason);
  });
}

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (isLocalDemo()) return;
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    if (!isCanceledError(error)) console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    if (!isCanceledError(error)) console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
