import { describe, expect, it } from "vitest";
import { isLocalDemoEnabled } from "./env";

describe("local demo environment gate", () => {
  it("requires an explicit flag and refuses to activate in production", () => {
    expect(isLocalDemoEnabled({ SYNAPSEX_LOCAL_DEMO: "true", NODE_ENV: "development" })).toBe(true);
    expect(isLocalDemoEnabled({ SYNAPSEX_LOCAL_DEMO: "true", NODE_ENV: "production" })).toBe(false);
    expect(isLocalDemoEnabled({ NODE_ENV: "development" })).toBe(false);
  });
});
