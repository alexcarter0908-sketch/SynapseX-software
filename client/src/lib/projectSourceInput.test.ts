import { describe, expect, it } from "vitest";
import { projectSourceInputKey } from "./projectSourceInput";

describe("project source input lifetime", () => {
  it("uses distinct keys when toggling between link and file modes", () => {
    expect(projectSourceInputKey("link")).toBe("link-source-input");
    expect(projectSourceInputKey("file")).toBe("file-source-input");
    expect(projectSourceInputKey("link")).not.toBe(projectSourceInputKey("file"));
  });
});
