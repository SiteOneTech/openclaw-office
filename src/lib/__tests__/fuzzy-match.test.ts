import { describe, it, expect } from "vitest";
import { fuzzyMatchAgentId, fuzzyMatchAgentIds } from "../fuzzy-match";

describe("fuzzyMatchAgentId", () => {
  const agents = ["cto", "cfo", "c-suite-cto", "deep-researcher", "data-analyst"];

  it("returns exact match with highest priority", () => {
    expect(fuzzyMatchAgentId("cto", agents)).toBe("cto");
  });

  it("returns prefix match when no exact match", () => {
    expect(fuzzyMatchAgentId("deep", agents)).toBe("deep-researcher");
  });

  it("returns contains match when no exact or prefix match", () => {
    expect(fuzzyMatchAgentId("analyst", agents)).toBe("data-analyst");
  });

  it("exact match takes priority over prefix match", () => {
    // "cto" exactly matches "cto", not "c-suite-cto"
    expect(fuzzyMatchAgentId("cto", agents)).toBe("cto");
  });

  it("prefix match takes priority over contains match", () => {
    // "data" is prefix of "data-analyst", not contains
    expect(fuzzyMatchAgentId("data", agents)).toBe("data-analyst");
  });

  it("returns null when no match", () => {
    expect(fuzzyMatchAgentId("nonexistent", agents)).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(fuzzyMatchAgentId("CTO", agents)).toBe("cto");
    expect(fuzzyMatchAgentId("DEEP", agents)).toBe("deep-researcher");
  });

  it("returns null for empty agentIds", () => {
    expect(fuzzyMatchAgentId("cto", [])).toBeNull();
  });

  it("matches partial ID fragment via contains", () => {
    // "suite" is contained in "c-suite-cto"
    expect(fuzzyMatchAgentId("suite", agents)).toBe("c-suite-cto");
  });

  it("matches by prefix with hyphenated IDs", () => {
    expect(fuzzyMatchAgentId("c-suite", agents)).toBe("c-suite-cto");
  });
});

describe("fuzzyMatchAgentIds", () => {
  const agents = ["cto", "cfo", "data-analyst"];

  it("returns list of matched agent IDs", () => {
    const result = fuzzyMatchAgentIds(["cto", "cfo"], agents);
    expect(result).toEqual(["cto", "cfo"]);
  });

  it("skips unmatched queries and warns", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = fuzzyMatchAgentIds(["cto", "ghost"], agents);
    expect(result).toEqual(["cto"]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("ghost"),
    );
    warnSpy.mockRestore();
  });

  it("returns empty array for all unmatched", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = fuzzyMatchAgentIds(["zzz", "qqq"], agents);
    expect(result).toEqual([]);
    warnSpy.mockRestore();
  });
});
