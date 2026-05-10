import { act, render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createElement, useRef, type RefObject } from "react";
import type { GatewayRpcClient } from "@/gateway/rpc-client";
import { buildAgentCostsFromSessionsUsage, buildSnapshotFromSessions, useUsagePoller } from "@/hooks/useUsagePoller";
import { useOfficeStore } from "@/store/office-store";

function UsagePollerHarness({ rpcRef }: { rpcRef: RefObject<GatewayRpcClient | null> }) {
  useUsagePoller(rpcRef);
  return null;
}

function resetStore() {
  useOfficeStore.setState({
    agents: new Map(),
    links: [],
    globalMetrics: {
      activeAgents: 0,
      totalAgents: 0,
      totalTokens: 0,
      tokenRate: 0,
      collaborationHeat: 0,
    },
    connectionStatus: "connected",
    connectionError: null,
    selectedAgentId: null,
    eventHistory: [],
    sidebarCollapsed: false,
    lastSessionsSnapshot: null,
    runIdMap: new Map(),
    sessionKeyMap: new Map(),
    agentCosts: {},
    tokenHistory: [],
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetStore();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("buildSnapshotFromSessions", () => {
  it("aggregates fresh session totals by agent", () => {
    vi.spyOn(Date, "now").mockReturnValue(123456);

    const snapshot = buildSnapshotFromSessions([
      { key: "agent:main:main", totalTokens: 1200, totalTokensFresh: true },
      { key: "agent:main:subagent:worker-1", totalTokens: 300, totalTokensFresh: true },
      { key: "agent:reviewer:main", totalTokens: 900, totalTokensFresh: true },
      { key: "agent:stale:main", totalTokens: 500, totalTokensFresh: false },
      { key: "channel:telegram:123", totalTokens: 700, totalTokensFresh: true },
    ]);

    expect(snapshot).toEqual({
      timestamp: 123456,
      total: 2400,
      byAgent: {
        main: 1500,
        reviewer: 900,
      },
    });
  });

  it("returns null when there are no usable fresh totals", () => {
    const snapshot = buildSnapshotFromSessions([
      { key: "agent:main:main", totalTokensFresh: false, totalTokens: 1200 },
      { key: "channel:telegram:123", totalTokensFresh: true, totalTokens: 200 },
      { key: "agent:reviewer:main" },
    ]);

    expect(snapshot).toBeNull();
  });
});

describe("buildAgentCostsFromSessionsUsage", () => {
  it("extracts per-agent total cost from sessions.usage aggregates", () => {
    const costs = buildAgentCostsFromSessionsUsage({
      aggregates: {
        byAgent: [
          { agentId: "main", totals: { totalCost: 1.25 } },
          { agentId: "reviewer", totals: { totalCost: 0.4 } },
          { agentId: "zero", totals: { totalCost: 0 } },
        ],
      },
    });

    expect(costs).toEqual({
      main: 1.25,
      reviewer: 0.4,
    });
  });

  it("returns null when sessions.usage has no usable agent costs", () => {
    expect(
      buildAgentCostsFromSessionsUsage({
        aggregates: {
          byAgent: [{ agentId: "main", totals: { totalCost: 0 } }],
        },
      }),
    ).toBeNull();
    expect(buildAgentCostsFromSessionsUsage(null)).toBeNull();
  });
});

describe("useUsagePoller", () => {
  it("updates both session snapshot and token snapshot from one sessions.list response", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.list") {
        return {
          sessions: [
            {
              key: "agent:main:main",
              agentId: "main",
              totalTokens: 1200,
              totalTokensFresh: true,
            },
            {
              key: "agent:main:subagent:worker-1",
              agentId: "main",
              requesterSessionKey: "agent:main:main",
              label: "Worker-1",
              totalTokens: 300,
              totalTokensFresh: true,
            },
          ],
        };
      }
      if (method === "sessions.usage") {
        return null;
      }
      if (method === "usage.cost") {
        return null;
      }
      return null;
    });

    function Wrapper() {
      const rpcRef = useRef({ request } as GatewayRpcClient);
      useUsagePoller(rpcRef as RefObject<GatewayRpcClient | null>);
      return null;
    }

    render(createElement(Wrapper));

    await act(async () => {
      await Promise.resolve();
    });

    expect(useOfficeStore.getState().lastSessionsSnapshot?.sessions).toEqual([
      expect.objectContaining({
        agentId: "worker-1",
        sessionKey: "agent:main:subagent:worker-1",
      }),
    ]);

    const latest = useOfficeStore.getState().tokenHistory.at(-1);
    expect(latest?.total).toBe(1500);
    expect(latest?.byAgent).toEqual({ main: 1500 });

    expect(request).toHaveBeenCalledWith("sessions.list");
  });

  it("polls again after 60 seconds", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.list") {
        return { sessions: [] };
      }
      return null;
    });

    function Wrapper() {
      const rpcRef = useRef({ request } as GatewayRpcClient);
      useUsagePoller(rpcRef as RefObject<GatewayRpcClient | null>);
      return null;
    }

    render(createElement(Wrapper));

    await act(async () => {
      await Promise.resolve();
    });

    expect(request).toHaveBeenCalledWith("sessions.list");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(request.mock.calls.filter(([method]) => method === "sessions.list")).toHaveLength(2);
  });
});
