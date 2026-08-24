import { config } from "dotenv";

config({ path: ".env.local", override: false });

export function isLocalDemoEnabled(environment: { SYNAPSEX_LOCAL_DEMO?: string; NODE_ENV?: string }): boolean {
  return environment.SYNAPSEX_LOCAL_DEMO === "true" && environment.NODE_ENV !== "production";
}

const runtimeEnvironment = process.env as unknown as { SYNAPSEX_LOCAL_DEMO?: string; NODE_ENV?: string };

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  isLocalDemo: isLocalDemoEnabled(runtimeEnvironment),
};
