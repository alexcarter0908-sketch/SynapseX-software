import { describe, expect, it } from "vitest";
import { getAnalyticsConfig } from "./analytics";

describe("local-safe analytics configuration", () => {
  it("does not create analytics configuration when hosted values are absent or unresolved placeholders", () => {
    expect(getAnalyticsConfig(undefined, undefined)).toBeUndefined();
    expect(getAnalyticsConfig("%VITE_ANALYTICS_ENDPOINT%", "%VITE_ANALYTICS_WEBSITE_ID%")).toBeUndefined();
    expect(getAnalyticsConfig("not a url", "site-1")).toBeUndefined();
  });

  it("accepts a configured HTTP(S) analytics endpoint", () => {
    expect(getAnalyticsConfig("https://analytics.example.com/", "site-1")).toEqual({ endpoint: "https://analytics.example.com", websiteId: "site-1" });
  });
});
