import { describe, it, expect } from "vitest";
import {
  extractSessionNamespace,
  isSubAgentSessionKey,
  extractParentNamespace,
  extractAgentIdFromSessionKey,
} from "../session-key-utils";

describe("session-key-utils", () => {
  describe("extractSessionNamespace", () => {
    it("extracts namespace from standard agent session key", () => {
      expect(extractSessionNamespace("agent:main:main")).toBe("agent:main");
    });

    it("extracts namespace from sub-agent session key", () => {
      expect(extractSessionNamespace("agent:main:subagent:some-uuid")).toBe("agent:main");
    });

    it("extracts namespace from arbitrary extension", () => {
      expect(extractSessionNamespace("agent:coder:thread:123")).toBe("agent:coder");
    });

    it("returns null for non-agent session keys", () => {
      expect(extractSessionNamespace("a2a-1234")).toBeNull();
      expect(extractSessionNamespace("peer:a:b")).toBeNull();
    });

    it("returns null when agentId is empty", () => {
      expect(extractSessionNamespace("agent::main")).toBeNull();
    });

    it("returns null when no second colon", () => {
      expect(extractSessionNamespace("agent:main")).toBeNull();
    });
  });

  describe("isSubAgentSessionKey", () => {
    it("detects sub-agent session key", () => {
      expect(isSubAgentSessionKey("agent:main:subagent:uuid-123")).toBe(true);
    });

    it("returns false for main session key", () => {
      expect(isSubAgentSessionKey("agent:main:main")).toBe(false);
    });

    it("returns false for peer session key", () => {
      expect(isSubAgentSessionKey("peer:a:b")).toBe(false);
    });

    it("returns false for a2a session key", () => {
      expect(isSubAgentSessionKey("a2a-12345")).toBe(false);
    });
  });

  describe("extractParentNamespace", () => {
    it("returns namespace for sub-agent key", () => {
      expect(extractParentNamespace("agent:main:subagent:uuid")).toBe("agent:main");
    });

    it("returns null for non-sub-agent key", () => {
      expect(extractParentNamespace("agent:main:main")).toBeNull();
    });

    it("returns null for non-agent key", () => {
      expect(extractParentNamespace("peer:a:b")).toBeNull();
    });
  });

  describe("extractAgentIdFromSessionKey", () => {
    it("extracts agentId from standard format", () => {
      expect(extractAgentIdFromSessionKey("agent:main:main")).toBe("main");
    });

    it("extracts parent agentId from sub-agent key", () => {
      expect(extractAgentIdFromSessionKey("agent:coder:subagent:uuid")).toBe("coder");
    });

    it("returns null for non-agent keys", () => {
      expect(extractAgentIdFromSessionKey("peer:a:b")).toBeNull();
    });

    it("returns full rest when no second colon", () => {
      // "agent:main" has no second colon, returns "main"
      expect(extractAgentIdFromSessionKey("agent:main")).toBe("main");
    });
  });
});
