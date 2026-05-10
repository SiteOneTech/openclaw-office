import { describe, it, expect } from "vitest";
import type { SubAgentInfo } from "@/gateway/types";
import {
  diffSessions,
  extractSubAgentUuidForTest,
  toSubAgentInfoList,
} from "@/hooks/useSubAgentPoller";

function mkSub(key: string, agentId = `agent-${key}`): SubAgentInfo {
  return {
    sessionKey: key,
    agentId,
    label: `Sub-${key}`,
    task: "test task",
    requesterSessionKey: "parent-session",
    startedAt: Date.now(),
  };
}

describe("extractSubAgentUuid", () => {
  it("extracts UUID from Gateway sessionKey", () => {
    const uuid = extractSubAgentUuidForTest("agent:main:subagent:5533959a-1a5e-4b44-a39a-a0799f71db92");
    expect(uuid).toBe("5533959a-1a5e-4b44-a39a-a0799f71db92");
  });

  it("returns null for non-subagent sessionKey", () => {
    expect(extractSubAgentUuidForTest("agent:main:session-123")).toBeNull();
    expect(extractSubAgentUuidForTest("agent:main:main")).toBeNull();
  });

  it("handles sessionKey with multiple colons in agent name", () => {
    const uuid = extractSubAgentUuidForTest("agent:my-agent:subagent:abc-123");
    expect(uuid).toBe("abc-123");
  });
});

describe("diffSessions", () => {
  it("detects newly added sessions", () => {
    const prev = [mkSub("s1")];
    const next = [mkSub("s1"), mkSub("s2")];
    const { added, removed } = diffSessions(prev, next);
    expect(added).toHaveLength(1);
    expect(added[0].sessionKey).toBe("s2");
    expect(removed).toHaveLength(0);
  });

  it("detects removed sessions", () => {
    const prev = [mkSub("s1"), mkSub("s2")];
    const next = [mkSub("s1")];
    const { added, removed } = diffSessions(prev, next);
    expect(added).toHaveLength(0);
    expect(removed).toHaveLength(1);
    expect(removed[0].sessionKey).toBe("s2");
  });

  it("handles no changes", () => {
    const prev = [mkSub("s1"), mkSub("s2")];
    const next = [mkSub("s1"), mkSub("s2")];
    const { added, removed } = diffSessions(prev, next);
    expect(added).toHaveLength(0);
    expect(removed).toHaveLength(0);
  });

  it("handles empty prev and next", () => {
    const { added, removed } = diffSessions([], []);
    expect(added).toHaveLength(0);
    expect(removed).toHaveLength(0);
  });

  it("handles full replacement", () => {
    const prev = [mkSub("s1"), mkSub("s2")];
    const next = [mkSub("s3"), mkSub("s4")];
    const { added, removed } = diffSessions(prev, next);
    expect(added).toHaveLength(2);
    expect(removed).toHaveLength(2);
  });
});

describe("toSubAgentInfoList", () => {
  it("normalizes raw sessions.list rows using key field", () => {
    const result = toSubAgentInfoList([
      {
        key: "agent:main:subagent:worker-1",
        agentId: "main",
        requesterSessionKey: "agent:main:main",
        label: "Worker",
      },
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        sessionKey: "agent:main:subagent:worker-1",
        agentId: "worker-1",
        requesterSessionKey: "agent:main:main",
        label: "Worker",
      }),
    ]);
  });

  it("ignores rows without requesterSessionKey", () => {
    const result = toSubAgentInfoList([
      {
        key: "agent:main:main",
        agentId: "main",
      },
    ]);

    expect(result).toEqual([]);
  });

  it("uses Gateway label as display name when provided", () => {
    const result = toSubAgentInfoList([
      {
        key: "agent:main:subagent:abc123",
        agentId: "main",
        requesterSessionKey: "agent:main:main",
        label: "Deep Researcher",
      },
    ]);

    expect(result[0].label).toBe("Deep Researcher");
  });

  it("falls back to Sub-<hash> when label is absent", () => {
    const result = toSubAgentInfoList([
      {
        key: "agent:main:subagent:abc123def456",
        agentId: "main",
        requesterSessionKey: "agent:main:main",
      },
    ]);

    expect(result[0].label).toMatch(/^Sub-/);
  });

  it("uses agentId as label fallback when no label and no UUID extracted", () => {
    const result = toSubAgentInfoList([
      {
        key: "agent:main:worker",
        agentId: "worker-agent",
        requesterSessionKey: "agent:main:main",
      },
    ]);

    // key does not contain :subagent:, so UUID extraction returns null
    // agentId is used as fallback
    expect(result.length).toBe(1);
    expect(result[0].label).toBeTruthy();
  });
});
