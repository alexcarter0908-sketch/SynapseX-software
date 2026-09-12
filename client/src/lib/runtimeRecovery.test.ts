import { describe, expect, it } from "vitest";
import { isCanceledReason, isExternalPreviewSource, recoveryMessage } from "./runtimeRecovery";

describe("runtime recovery classification", () => {
  it("classifies canceled preview requests without treating them as app crashes", () => {
    expect(isCanceledReason("Canceled: Canceled")).toBe(true);
    expect(recoveryMessage("Canceled: Canceled")).toContain("reload Assistant");
  });

  it("recognizes the external editor and logs sources", () => {
    expect(isExternalPreviewSource("https://host/editor.main.js:122")).toBe(true);
    expect(isExternalPreviewSource("https://host/manus/logs")).toBe(true);
    expect(isExternalPreviewSource("/src/main.tsx")).toBe(false);
  });

  it("keeps ordinary app errors readable", () => {
    expect(recoveryMessage(new Error("render failed"))).toContain("render failed");
  });
});
