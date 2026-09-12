import { describe, expect, it } from "vitest";
import { summarizeProjectContext } from "./projectContext";

describe("browser project-context inspection", () => {
  it("derives usable project evidence from selected source and configuration files", () => {
    const context = summarizeProjectContext("billing-api", [
      { path: "package.json", content: JSON.stringify({ dependencies: { express: "^4.0.0", drizzle: "^0.44.0" }, devDependencies: { typescript: "^5.0.0" } }) },
      { path: "src/server.ts", content: "import express from 'express';" },
      { path: "src/schema.ts", content: "import { drizzle } from 'drizzle-orm';" },
    ]);
    expect(context.languages).toContain("TypeScript");
    expect(context.frameworks).toEqual(expect.arrayContaining(["Express", "Drizzle ORM"]));
    expect(context.dependencies).toEqual(expect.arrayContaining(["express", "drizzle", "typescript"]));
    expect(context.evidence).toContain("FILE: src/server.ts");
  });

  it("keeps malformed config as source evidence instead of claiming dependencies were detected", () => {
    const context = summarizeProjectContext("unknown", [{ path: "package.json", content: "{ not valid JSON" }]);
    expect(context.dependencies).toEqual([]);
    expect(context.evidence).toContain("not valid JSON");
  });
});
