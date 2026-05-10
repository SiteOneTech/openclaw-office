import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentSelector } from "@/components/chat/AgentSelector";
import { useChatDockStore } from "@/store/console-stores/chat-dock-store";
import { useOfficeStore } from "@/store/office-store";

vi.mock("@/gateway/adapter-provider", () => ({
  waitForAdapter: vi.fn(async () => ({
    agentsList: async () => ({
      defaultId: "main",
      mainKey: "agent:main:main",
      scope: "global",
      agents: [
        { id: "main", name: "", identity: { name: "" } },
        { id: "coder", name: "CodeClaw", identity: { name: "CodeClaw" } },
      ],
    }),
  })),
}));

function makeVisualAgent(id: string, name: string) {
  return {
    id,
    name,
    status: "idle" as const,
    position: { x: 0, y: 0 },
    currentTool: null,
    speechBubble: null,
    lastActiveAt: Date.now(),
    toolCallCount: 0,
    toolCallHistory: [],
    runId: null,
    isSubAgent: false,
    isPlaceholder: false,
    parentAgentId: null,
    childAgentIds: [],
    zone: "desk" as const,
    originalPosition: null,
    movement: null,
    confirmed: true,
    arrivedAtHotDeskAt: null,
    pendingRetire: false,
  };
}

describe("AgentSelector", () => {
  beforeEach(() => {
    useChatDockStore.setState({
      ...useChatDockStore.getState(),
      targetAgentId: "main",
    });
    useOfficeStore.setState({
      agents: new Map([
        ["main", makeVisualAgent("main", "CEO")],
        ["coder", makeVisualAgent("coder", "代码员")],
      ]),
    });
  });

  it("falls back to office agent names when gateway omits the main agent label", async () => {
    await act(async () => {
      render(<AgentSelector />);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /CEO/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /CEO/i }));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /CEO/i })).toHaveLength(2);
      expect(screen.getByRole("button", { name: /CodeClaw/i })).toBeInTheDocument();
    });
  });
});
