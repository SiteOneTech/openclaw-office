import { describe, expect, it } from "vitest";
import type { VisualAgent } from "@/gateway/types";
import { detectPeerAgentHintsFromAssistantText } from "./assistant-collaboration-hints";

function createAgent(id: string, name = id): VisualAgent {
  return {
    id,
    name,
    status: "idle",
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
    zone: "desk",
    originalPosition: null,
    movement: null,
    confirmed: true,
    arrivedAtHotDeskAt: null,
    pendingRetire: false,
    arrivedAtMeetingAt: null,
    manualMeeting: false,
  };
}

describe("detectPeerAgentHintsFromAssistantText", () => {
  it("detects fixed peer agents from collaboration hints", () => {
    const agents = [
      createAgent("ceo", "CEO"),
      createAgent("deep-researcher", "深度研究员"),
      createAgent("data-analyst", "数据分析师"),
    ];

    const result = detectPeerAgentHintsFromAssistantText(
      "现在用 thread=true 建立持久会话，并通过 sessions_send 让 deep-researcher 和 data-analyst 直接通话。",
      "ceo",
      agents,
    );

    expect(result).toEqual(["deep-researcher", "data-analyst"]);
  });

  it("supports localized agent names", () => {
    const agents = [
      createAgent("ceo", "CEO"),
      createAgent("deep-researcher", "深度研究员"),
      createAgent("data-analyst", "数据分析师"),
    ];

    const result = detectPeerAgentHintsFromAssistantText(
      "我会建立协作链路，让深度研究员和数据分析师互相调用处理子任务。",
      "ceo",
      agents,
    );

    expect(result).toEqual(["deep-researcher", "data-analyst"]);
  });

  it("returns empty when text is only planning without collaboration hint", () => {
    const agents = [
      createAgent("ceo", "CEO"),
      createAgent("deep-researcher", "深度研究员"),
      createAgent("data-analyst", "数据分析师"),
    ];

    const result = detectPeerAgentHintsFromAssistantText(
      "我找到了 deep-researcher 和 data-analyst，接下来先整理计划。",
      "ceo",
      agents,
    );

    expect(result).toEqual([]);
  });

  it("excludes the current agent and sub-agents", () => {
    const subAgent = createAgent("sub-worker", "子代理");
    subAgent.isSubAgent = true;
    const agents = [createAgent("ceo", "CEO"), createAgent("deep-researcher", "深度研究员"), subAgent];

    const result = detectPeerAgentHintsFromAssistantText(
      "通过 sessions_send 让 CEO 和深度研究员直接通话，并顺便让子代理参与。",
      "ceo",
      agents,
    );

    expect(result).toEqual(["deep-researcher"]);
  });
});
