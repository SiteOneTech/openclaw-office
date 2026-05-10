import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAdapterForTests, initAdapter } from "@/gateway/adapter-provider";
import { useChatDockStore } from "@/store/console-stores/chat-dock-store";
import { useOfficeStore } from "@/store/office-store";
import { ChatPage } from "./ChatPage";

vi.stubGlobal(
  "URL",
  Object.assign(globalThis.URL ?? {}, {
    createObjectURL: vi.fn(() => "blob:test"),
    revokeObjectURL: vi.fn(),
  }),
);

function resetChatStore() {
  localStorage.removeItem("openclaw-office-chat-page:last-session");
  const state = useChatDockStore.getState();
  useChatDockStore.setState({
    ...state,
    messages: [],
    isStreaming: false,
    currentSessionKey: "agent:main:main",
    dockExpanded: false,
    targetAgentId: "main",
    sessions: [],
    error: null,
    activeRunId: null,
    streamingMessage: null,
    isHistoryLoaded: true,
    isHistoryLoading: false,
    draft: "",
    attachments: [],
    queue: [],
    focusMode: false,
    searchQuery: "",
    pinnedMessageIds: [],
    thinkingLevel: null,
    loadSessions: async () => {},
    initializeHistory: async () => {},
  });
}

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

describe("ChatPage", () => {
  beforeEach(async () => {
    __resetAdapterForTests();
    await initAdapter("mock");
    resetChatStore();
    useOfficeStore.setState({
      agents: new Map([["main", makeVisualAgent("main", "CEO")]]),
    });
  });

  it("renders the session sidebar and removes the top search bar", async () => {
    useChatDockStore.setState({
      sessions: [
        {
          key: "agent:main:session-1",
          label: "agent:main:session-1",
          createdAt: 1,
          lastActiveAt: Date.now(),
          messageCount: 2,
        },
      ],
    });

    await act(async () => {
      render(<ChatPage />);
    });

    expect(screen.getByText("最近历史")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("搜索当前会话转录...")).not.toBeInTheDocument();
  });

  it("shows slash command suggestions from the draft", async () => {
    await act(async () => {
      render(<ChatPage />);
    });
    fireEvent.change(screen.getByPlaceholderText("输入消息... (Enter 发送, Shift+Enter 换行)"), {
      target: { value: "/he" },
    });

    await waitFor(() => {
      expect(screen.getByText("/help")).toBeInTheDocument();
    });
  });

  it("loads available agents from gateway and switches the active target", async () => {
    await act(async () => {
      render(<ChatPage />);
    });

    const selector = await screen.findByRole("button", { name: /main|CEO/i });
    fireEvent.click(selector);

    const coderOption = await screen.findByRole("button", { name: /CodeClaw/i });
    fireEvent.click(coderOption);

    await waitFor(() => {
      expect(useChatDockStore.getState().targetAgentId).toBe("coder");
      expect(useChatDockStore.getState().currentSessionKey).toMatch(/^agent:coder:session-\d+$/u);
    });
  });

  it("uses the office agent name for the main session title", async () => {
    await act(async () => {
      render(<ChatPage />);
    });

    expect(screen.getByRole("heading", { name: "CEO" })).toBeInTheDocument();
  });

  it("pins a message into the pinned strip", async () => {
    useChatDockStore.setState({
      messages: [
        {
          id: "1",
          role: "assistant",
          content: "pin me please",
          timestamp: 1,
          authorAgentId: "main",
        },
      ],
    });

    await act(async () => {
      render(<ChatPage />);
    });
    fireEvent.click(screen.getAllByRole("button", { name: "置顶" })[0]!);

    await waitFor(() => {
      expect(screen.getAllByText("已置顶").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /pin me please/i })).toBeInTheDocument();
    });
  });

  it("renders speaker labels for user and assistant messages", async () => {
    useChatDockStore.setState({
      messages: [
        { id: "user-1", role: "user", content: "hello", timestamp: 1 },
        { id: "assistant-1", role: "assistant", content: "hi", timestamp: 2, authorAgentId: "main" },
      ],
    });

    await act(async () => {
      render(<ChatPage />);
    });

    expect(screen.getAllByText("你").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CEO").length).toBeGreaterThan(0);
  });
});
