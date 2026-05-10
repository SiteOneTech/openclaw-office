import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AgentEventPayload } from "@/gateway/types";
import { useOfficeStore } from "@/store/office-store";

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
    connectionStatus: "disconnected",
    connectionError: null,
    selectedAgentId: null,
    eventHistory: [],
    sidebarCollapsed: false,
    lastSessionsSnapshot: null,
    theme: "dark",
    operatorScopes: [],
    tokenHistory: [],
    agentCosts: {},
    runIdMap: new Map(),
    sessionKeyMap: new Map(),
  });
}

function setRunIdMap(entries: [string, string][]) {
  useOfficeStore.setState({ runIdMap: new Map(entries) });
}

describe("office-store", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("initAgents", () => {
    it("initializes agents from summary list", () => {
      const { initAgents } = useOfficeStore.getState();
      initAgents([
        { id: "agent-1", name: "Coder" },
        { id: "agent-2", name: "Reviewer", identity: { name: "Rev" } },
      ]);

      const state = useOfficeStore.getState();
      // 2 real agents + 8 placeholder agents (maxSubAgents default)
      const realAgents = Array.from(state.agents.values()).filter((a) => !a.isPlaceholder);
      expect(realAgents).toHaveLength(2);
      expect(state.agents.get("agent-1")?.name).toBe("Coder");
      expect(state.agents.get("agent-2")?.name).toBe("Rev");
      expect(state.globalMetrics.totalAgents).toBe(2);
    });
  });

  describe("processAgentEvent", () => {
    it("lifecycle start → thinking status", () => {
      useOfficeStore.getState().initAgents([{ id: "a1", name: "Alpha" }]);
      setRunIdMap([["run-1", "a1"]]);

      useOfficeStore.getState().processAgentEvent({
        runId: "run-1",
        seq: 1,
        stream: "lifecycle",
        ts: Date.now(),
        data: { phase: "start" },
      });

      const agent = useOfficeStore.getState().agents.get("a1");
      expect(agent?.status).toBe("thinking");
    });

    it("tool start → tool_calling, increments count", () => {
      useOfficeStore.getState().initAgents([{ id: "a1", name: "Alpha" }]);
      setRunIdMap([["run-1", "a1"]]);

      useOfficeStore.getState().processAgentEvent({
        runId: "run-1",
        seq: 2,
        stream: "tool",
        ts: Date.now(),
        data: { phase: "start", name: "search" },
      });

      const agent = useOfficeStore.getState().agents.get("a1");
      expect(agent?.status).toBe("tool_calling");
      expect(agent?.currentTool?.name).toBe("search");
      expect(agent?.toolCallCount).toBe(1);
    });

    it("full lifecycle: idle → thinking → tool → speaking → idle (deferred)", () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });

      useOfficeStore.getState().initAgents([{ id: "a1", name: "Alpha" }]);
      setRunIdMap([["run-1", "a1"]]);

      const now = Date.now();
      const events: AgentEventPayload[] = [
        { runId: "run-1", seq: 1, stream: "lifecycle", ts: now, data: { phase: "start" } },
        { runId: "run-1", seq: 2, stream: "tool", ts: now + 1, data: { phase: "start", name: "web" } },
        { runId: "run-1", seq: 3, stream: "tool", ts: now + 2, data: { phase: "end", name: "web" } },
        { runId: "run-1", seq: 4, stream: "assistant", ts: now + 3, data: { text: "Done!" } },
        { runId: "run-1", seq: 5, stream: "lifecycle", ts: now + 4, data: { phase: "end" } },
      ];

      const immediateStatuses = ["thinking", "tool_calling", "thinking", "speaking", "speaking"];
      for (let i = 0; i < events.length; i++) {
        useOfficeStore.getState().processAgentEvent(events[i]);
        const agent = useOfficeStore.getState().agents.get("a1");
        expect(agent?.status).toBe(immediateStatuses[i]);
      }

      // After MIN_ACTIVE_DISPLAY_MS the deferred idle kicks in
      vi.advanceTimersByTime(6_000);
      const agent = useOfficeStore.getState().agents.get("a1");
      expect(agent?.status).toBe("idle");

      vi.useRealTimers();
    });

    it("creates unconfirmed agent for unknown runId in corridor zone", () => {
      useOfficeStore.getState().processAgentEvent({
        runId: "unknown-run",
        seq: 1,
        stream: "lifecycle",
        ts: Date.now(),
        data: { phase: "start" },
      });

      const state = useOfficeStore.getState();
      const agent = state.agents.get("unknown-run");
      expect(agent).toBeDefined();
      expect(agent?.confirmed).toBe(false);
      expect(agent?.zone).toBe("corridor");
      expect(agent?.status).toBe("thinking");
    });

    it("creates peer meeting links from assistant collaboration hints", () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });

      useOfficeStore.getState().initAgents([
        { id: "ceo", name: "CEO" },
        { id: "deep-researcher", name: "深度研究员" },
        { id: "data-analyst", name: "数据分析师" },
      ]);
      setRunIdMap([["run-main", "ceo"]]);

      useOfficeStore.getState().processAgentEvent({
        runId: "run-main",
        seq: 1,
        stream: "assistant",
        ts: Date.now(),
        sessionKey: "agent:ceo:main",
        data: {
          text: "现在用 thread=true 建立协作链路，并通过 sessions_send 让 deep-researcher 和 data-analyst 直接通话。",
        },
      });

      let state = useOfficeStore.getState();
      expect(
        state.links.some(
          (link) =>
            link.isPeer === true &&
            ((link.sourceId === "deep-researcher" && link.targetId === "data-analyst") ||
              (link.sourceId === "data-analyst" && link.targetId === "deep-researcher")),
        ),
      ).toBe(true);

      vi.advanceTimersByTime(600);

      state = useOfficeStore.getState();
      expect(state.agents.get("deep-researcher")?.movement?.toZone).toBe("meeting");
      expect(state.agents.get("data-analyst")?.movement?.toZone).toBe("meeting");

      vi.useRealTimers();
    });
  });

  describe("selectAgent", () => {
    it("selects and deselects agent", () => {
      const { selectAgent } = useOfficeStore.getState();

      selectAgent("a1");
      expect(useOfficeStore.getState().selectedAgentId).toBe("a1");

      selectAgent("a1");
      expect(useOfficeStore.getState().selectedAgentId).toBeNull();
    });
  });

  describe("event history", () => {
    it("records events up to limit", () => {
      useOfficeStore.getState().initAgents([{ id: "a1", name: "A" }]);
      setRunIdMap([["r1", "a1"]]);

      for (let i = 0; i < 250; i++) {
        useOfficeStore.getState().processAgentEvent({
          runId: "r1",
          seq: i,
          stream: "lifecycle",
          ts: i,
          data: { phase: "start" },
        });
      }

      expect(useOfficeStore.getState().eventHistory.length).toBeLessThanOrEqual(200);
    });
  });

  describe("extended fields", () => {
    it("initializes parentAgentId / childAgentIds / zone / originalPosition", () => {
      useOfficeStore.getState().initAgents([{ id: "a1", name: "A" }]);
      const agent = useOfficeStore.getState().agents.get("a1")!;
      expect(agent.parentAgentId).toBeNull();
      expect(agent.childAgentIds).toEqual([]);
      expect(agent.zone).toBe("desk");
      expect(agent.originalPosition).toBeNull();
    });
  });

  describe("token snapshots", () => {
    it("updates global token metrics from pushed snapshots", () => {
      useOfficeStore.getState().pushTokenSnapshot({
        timestamp: 60_000,
        total: 1200,
        byAgent: { a1: 1200 },
      });

      let state = useOfficeStore.getState();
      expect(state.globalMetrics.totalTokens).toBe(1200);
      expect(state.globalMetrics.tokenRate).toBe(0);

      useOfficeStore.getState().pushTokenSnapshot({
        timestamp: 120_000,
        total: 1800,
        byAgent: { a1: 1800 },
      });

      state = useOfficeStore.getState();
      expect(state.globalMetrics.totalTokens).toBe(1800);
      expect(state.globalMetrics.tokenRate).toBe(600);
    });
  });

  describe("theme", () => {
    it("defaults to dark", () => {
      expect(useOfficeStore.getState().theme).toBe("dark");
    });

    it("setTheme switches to light", () => {
      useOfficeStore.getState().setTheme("light");
      expect(useOfficeStore.getState().theme).toBe("light");
    });

    it("setTheme persists to localStorage", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem");
      useOfficeStore.getState().setTheme("light");
      expect(spy).toHaveBeenCalledWith("openclaw-theme", "light");
      spy.mockRestore();
    });

    it("setTheme switches back to dark", () => {
      useOfficeStore.getState().setTheme("light");
      useOfficeStore.getState().setTheme("dark");
      expect(useOfficeStore.getState().theme).toBe("dark");
    });
  });


  describe("globalMetrics", () => {
    it("counts active agents correctly", () => {
      useOfficeStore.getState().initAgents([
        { id: "a1", name: "A" },
        { id: "a2", name: "B" },
        { id: "a3", name: "C" },
      ]);
      setRunIdMap([
        ["r1", "a1"],
        ["r2", "a2"],
      ]);

      useOfficeStore.getState().processAgentEvent({
        runId: "r1",
        seq: 1,
        stream: "lifecycle",
        ts: 1,
        data: { phase: "start" },
      });
      useOfficeStore.getState().processAgentEvent({
        runId: "r2",
        seq: 1,
        stream: "lifecycle",
        ts: 1,
        data: { phase: "start" },
      });

      expect(useOfficeStore.getState().globalMetrics.activeAgents).toBe(2);
      expect(useOfficeStore.getState().globalMetrics.totalAgents).toBe(3);
    });
  });

  describe("namespace-based collaboration links", () => {
    it("creates link between parent agent and sub-agent via namespace matching", () => {
      useOfficeStore.getState().initAgents([{ id: "cto", name: "CTO" }]);
      setRunIdMap([
        ["run-cto", "cto"],
        ["run-sub", "sub-abc123"],
      ]);

      // Parent receives event with its own session key
      useOfficeStore.getState().processAgentEvent({
        runId: "run-cto",
        seq: 1,
        stream: "lifecycle",
        ts: Date.now(),
        sessionKey: "agent:cto:main-session",
        data: { phase: "start" },
      });

      // Sub-agent is created
      useOfficeStore.getState().addSubAgent("cto", {
        sessionKey: "agent:cto:subagent:abc123",
        agentId: "sub-abc123",
        label: "Worker",
        task: "",
        requesterSessionKey: "agent:cto:main-session",
        startedAt: Date.now(),
      });

      // Sub-agent sends an event with its own (sub-agent) session key
      useOfficeStore.getState().processAgentEvent({
        runId: "run-sub",
        seq: 1,
        stream: "lifecycle",
        ts: Date.now(),
        sessionKey: "agent:cto:subagent:abc123",
        data: { phase: "start" },
      });

      const state = useOfficeStore.getState();
      const hasLink = state.links.some(
        (l) =>
          (l.sourceId === "cto" && l.targetId === "sub-abc123") ||
          (l.sourceId === "sub-abc123" && l.targetId === "cto"),
      );
      expect(hasLink).toBe(true);
    });

    it("does NOT create link between agents in different namespaces", () => {
      useOfficeStore.getState().initAgents([
        { id: "cto", name: "CTO" },
        { id: "cfo", name: "CFO" },
      ]);
      setRunIdMap([
        ["run-cto", "cto"],
        ["run-cfo", "cfo"],
      ]);

      useOfficeStore.getState().processAgentEvent({
        runId: "run-cto",
        seq: 1,
        stream: "lifecycle",
        ts: Date.now(),
        sessionKey: "agent:cto:main-session",
        data: { phase: "start" },
      });

      useOfficeStore.getState().processAgentEvent({
        runId: "run-cfo",
        seq: 1,
        stream: "lifecycle",
        ts: Date.now(),
        sessionKey: "agent:cfo:main-session",
        data: { phase: "start" },
      });

      const state = useOfficeStore.getState();
      const hasLink = state.links.some(
        (l) =>
          (l.sourceId === "cto" && l.targetId === "cfo") ||
          (l.sourceId === "cfo" && l.targetId === "cto"),
      );
      expect(hasLink).toBe(false);
    });

    it("single agent in namespace does NOT trigger link", () => {
      useOfficeStore.getState().initAgents([{ id: "cto", name: "CTO" }]);
      setRunIdMap([["run-cto", "cto"]]);

      useOfficeStore.getState().processAgentEvent({
        runId: "run-cto",
        seq: 1,
        stream: "lifecycle",
        ts: Date.now(),
        sessionKey: "agent:cto:main-session",
        data: { phase: "start" },
      });

      const state = useOfficeStore.getState();
      expect(state.links).toHaveLength(0);
    });
  });

  describe("requestMeeting / dismissMeeting", () => {
    it("requestMeeting moves agents to meeting zone", () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      useOfficeStore.getState().initAgents([
        { id: "cto", name: "CTO" },
        { id: "cfo", name: "CFO" },
      ]);

      useOfficeStore.getState().requestMeeting(["cto", "cfo"]);

      const cto = useOfficeStore.getState().agents.get("cto");
      const cfo = useOfficeStore.getState().agents.get("cfo");
      expect(cto?.manualMeeting).toBe(true);
      expect(cfo?.manualMeeting).toBe(true);
      // Both should be walking toward meeting zone
      expect(cto?.movement?.toZone).toBe("meeting");
      expect(cfo?.movement?.toZone).toBe("meeting");
      vi.useRealTimers();
    });

    it("requestMeeting skips agents already in meeting zone", () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      useOfficeStore.getState().initAgents([
        { id: "cto", name: "CTO" },
        { id: "cfo", name: "CFO" },
      ]);

      // First call moves cto
      useOfficeStore.getState().requestMeeting(["cto"]);
      // Complete movement for cto
      useOfficeStore.getState().completeMovement("cto");

      const cto = useOfficeStore.getState().agents.get("cto");
      expect(cto?.zone).toBe("meeting");

      // Second call should skip cto (already in meeting)
      useOfficeStore.getState().requestMeeting(["cto", "cfo"]);

      // cto should not have a new movement started
      const ctoAfter = useOfficeStore.getState().agents.get("cto");
      expect(ctoAfter?.zone).toBe("meeting");
      expect(ctoAfter?.movement).toBeNull();

      // cfo should start moving to meeting
      const cfo = useOfficeStore.getState().agents.get("cfo");
      expect(cfo?.movement?.toZone).toBe("meeting");
      vi.useRealTimers();
    });

    it("requestMeeting ignores invalid IDs with warn", () => {
      useOfficeStore.getState().initAgents([{ id: "cto", name: "CTO" }]);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      useOfficeStore.getState().requestMeeting(["cto", "nonexistent"]);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("nonexistent"));
      warnSpy.mockRestore();

      const cto = useOfficeStore.getState().agents.get("cto");
      expect(cto?.manualMeeting).toBe(true);
    });

    it("requestMeeting supports fuzzy matching", () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      useOfficeStore.getState().initAgents([{ id: "c-suite-cto", name: "CTO" }]);

      useOfficeStore.getState().requestMeeting(["cto"]);

      const agent = useOfficeStore.getState().agents.get("c-suite-cto");
      expect(agent?.manualMeeting).toBe(true);
      vi.useRealTimers();
    });

    it("dismissMeeting with no args returns all agents from meeting", () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      useOfficeStore.getState().initAgents([
        { id: "cto", name: "CTO" },
        { id: "cfo", name: "CFO" },
      ]);

      useOfficeStore.getState().requestMeeting(["cto", "cfo"]);
      useOfficeStore.getState().completeMovement("cto");
      useOfficeStore.getState().completeMovement("cfo");

      // Both in meeting now
      expect(useOfficeStore.getState().agents.get("cto")?.zone).toBe("meeting");
      expect(useOfficeStore.getState().agents.get("cfo")?.zone).toBe("meeting");

      useOfficeStore.getState().dismissMeeting();

      const cto = useOfficeStore.getState().agents.get("cto");
      const cfo = useOfficeStore.getState().agents.get("cfo");
      // After dismiss, both should be on their way back (movement started from returnFromMeeting)
      expect(cto?.manualMeeting).toBe(false);
      expect(cfo?.manualMeeting).toBe(false);
      vi.useRealTimers();
    });

    it("dismissMeeting with specific agentIds only dismisses those agents", () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      useOfficeStore.getState().initAgents([
        { id: "cto", name: "CTO" },
        { id: "cfo", name: "CFO" },
      ]);

      useOfficeStore.getState().requestMeeting(["cto", "cfo"]);
      useOfficeStore.getState().completeMovement("cto");
      useOfficeStore.getState().completeMovement("cfo");

      useOfficeStore.getState().dismissMeeting(["cto"]);

      const cto = useOfficeStore.getState().agents.get("cto");
      const cfo = useOfficeStore.getState().agents.get("cfo");
      expect(cto?.manualMeeting).toBe(false);
      // cfo should still be in meeting
      expect(cfo?.zone).toBe("meeting");
      expect(cfo?.manualMeeting).toBe(true);
      vi.useRealTimers();
    });
  });
});
