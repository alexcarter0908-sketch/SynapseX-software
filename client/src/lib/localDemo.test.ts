import { describe, expect, it } from "vitest";
import { isExplicitLocalDemoHost } from "./localDemo";

describe("local demo browser gate", () => {
  it("requires both a loopback host and explicit client flag", () => {
    expect(isExplicitLocalDemoHost("localhost", "true")).toBe(true);
    expect(isExplicitLocalDemoHost("127.0.0.1", "true")).toBe(true);
    expect(isExplicitLocalDemoHost("localhost", undefined)).toBe(false);
    expect(isExplicitLocalDemoHost("app.example.com", "true")).toBe(false);
  });
});
