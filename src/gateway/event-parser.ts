import i18n from "@/i18n";
import type { AgentEventPayload, AgentVisualStatus, SpeechBubble, ToolInfo } from "./types";

export interface ParsedAgentEvent {
  runId: string;
  sessionKey?: string;
  status: AgentVisualStatus;
  currentTool: ToolInfo | null;
  speechBubble: SpeechBubble | null;
  clearTool: boolean;
  clearSpeech: boolean;
  incrementToolCount: boolean;
  toolRecord: { name: string; timestamp: number } | null;
  summary: string;
}

export function parseAgentEvent(event: AgentEventPayload): ParsedAgentEvent {
  const base: ParsedAgentEvent = {
    runId: event.runId,
    sessionKey: event.sessionKey,
    status: "idle",
    currentTool: null,
    speechBubble: null,
    clearTool: false,
    clearSpeech: false,
    incrementToolCount: false,
    toolRecord: null,
    summary: "",
  };

  switch (event.stream) {
    case "lifecycle":
      return parseLifecycle(base, event);
    case "tool":
      return parseTool(base, event);
    case "assistant":
      return parseAssistant(base, event);
    case "error":
      return parseError(base, event);
    case "item":
      return parseItem(base, event);
    case "plan":
      return parsePlan(base, event);
    case "approval":
      return parseApproval(base, event);
    case "command_output":
      return parseCommandOutput(base, event);
    case "patch":
      return parsePatch(base, event);
    case "thinking":
      return parseThinking(base, event);
    case "compaction":
      return parseCompaction(base, event);
    default:
      // 完全未知的流类型：保持 idle，不写入历史（summary 为空会在 store 中被跳过）
      base.status = "idle";
      base.summary = "";
      return base;
  }
}

function parseLifecycle(result: ParsedAgentEvent, event: AgentEventPayload): ParsedAgentEvent {
  const phase = event.data.phase as string | undefined;

  switch (phase) {
    case "start":
    case "thinking":
      result.status = "thinking";
      result.summary =
        phase === "start" ? i18n.t("common:events.startRunning") : i18n.t("common:events.thinking");
      break;
    case "end":
      result.status = "idle";
      result.clearTool = true;
      result.clearSpeech = true;
      result.summary = i18n.t("common:events.runEnded");
      break;
    case "fallback":
      result.status = "error";
      result.summary = i18n.t("common:events.fallback");
      break;
    default:
      result.status = "thinking";
      result.summary = i18n.t("common:events.lifecycleUnknown", { phase: phase ?? "unknown" });
  }

  return result;
}

function parseTool(result: ParsedAgentEvent, event: AgentEventPayload): ParsedAgentEvent {
  const phase = event.data.phase as string | undefined;
  const name = (event.data.name as string) ?? "unknown";

  if (phase === "start") {
    result.status = "tool_calling";
    result.currentTool = {
      name,
      args: event.data.args as Record<string, unknown> | undefined,
      startedAt: event.ts,
    };
    result.incrementToolCount = true;
    result.toolRecord = { name, timestamp: event.ts };
    result.summary = i18n.t("common:events.toolCall", { name });
  } else {
    result.status = "thinking";
    result.clearTool = true;
    result.summary = i18n.t("common:events.toolDone", { name });
  }

  return result;
}

function parseAssistant(result: ParsedAgentEvent, event: AgentEventPayload): ParsedAgentEvent {
  const text = (event.data.text as string) ?? "";
  result.status = "speaking";
  result.speechBubble = { text, timestamp: event.ts };
  result.summary = text.length > 40 ? `${text.slice(0, 40)}...` : text;
  return result;
}

function parseError(result: ParsedAgentEvent, event: AgentEventPayload): ParsedAgentEvent {
  const message = (event.data.message as string) ?? i18n.t("common:errors.unknownError");
  result.status = "error";
  result.summary = i18n.t("common:events.errorPrefix", { message });
  return result;
}

function parseCommandOutput(result: ParsedAgentEvent, event: AgentEventPayload): ParsedAgentEvent {
  // command_output 携带终端命令执行结果
  // 尝试 output / text / content 等常见字段
  const output =
    (event.data.output as string) ??
    (event.data.text as string) ??
    (event.data.content as string) ??
    "";
  const exitCode = event.data.exitCode ?? event.data.exit_code;

  result.status = "thinking";

  if (output) {
    result.summary = output.length > 60 ? `${output.slice(0, 60)}...` : output;
    result.speechBubble = { text: output, timestamp: event.ts };
  } else if (exitCode !== undefined) {
    result.summary = i18n.t("common:events.commandExited", { code: String(exitCode) });
  } else {
    result.summary = i18n.t("common:events.commandOutput");
  }

  return result;
}

function parseItem(result: ParsedAgentEvent, event: AgentEventPayload): ParsedAgentEvent {
  // item 流：工具/命令执行的结构化追踪事件（AgentItemEventData）
  const phase = event.data.phase as string | undefined;
  const kind = (event.data.kind as string) ?? "tool";
  const title = (event.data.title as string) ?? "";
  const name = (event.data.name as string) ?? "";
  const status = (event.data.status as string) ?? "";

  result.status = "thinking";

  if (phase === "start") {
    result.summary = i18n.t("common:events.itemStart", { title: title || name || kind });
  } else if (phase === "end") {
    const failed = status === "failed" || status === "error";
    if (failed) {
      result.summary = i18n.t("common:events.itemFailed", { title: title || name || kind });
    } else {
      result.summary = i18n.t("common:events.itemDone", { title: title || name || kind });
    }
  } else {
    result.summary = title || name || i18n.t("common:events.itemUpdate");
  }

  return result;
}

function parsePlan(result: ParsedAgentEvent, event: AgentEventPayload): ParsedAgentEvent {
  // plan 流：代理计划更新
  const title = (event.data.title as string) ?? "";
  result.status = "thinking";
  result.summary = i18n.t("common:events.plan", { title });
  return result;
}

function parseApproval(result: ParsedAgentEvent, event: AgentEventPayload): ParsedAgentEvent {
  // approval 流：等待用户审批（如 exec 命令批准）
  const phase = event.data.phase as string | undefined;
  const title = (event.data.title as string) ?? "";
  result.status = "thinking";
  if (phase === "requested") {
    result.summary = i18n.t("common:events.approvalRequested", { title });
  } else {
    result.summary = i18n.t("common:events.approvalResolved", { title });
  }
  return result;
}

function parsePatch(result: ParsedAgentEvent, event: AgentEventPayload): ParsedAgentEvent {
  // patch 流：文件变更补丁摘要
  const added = (event.data.added as string[]) ?? [];
  const modified = (event.data.modified as string[]) ?? [];
  const deleted = (event.data.deleted as string[]) ?? [];
  const total = added.length + modified.length + deleted.length;
  result.status = "thinking";
  result.summary = i18n.t("common:events.patch", { total });
  return result;
}

function parseThinking(result: ParsedAgentEvent, event: AgentEventPayload): ParsedAgentEvent {
  // thinking 流：模型推理/思考过程
  const text = (event.data.text as string) ?? (event.data.thinking as string) ?? "";
  result.status = "thinking";
  result.summary = text.length > 60 ? `${text.slice(0, 60)}...` : text || i18n.t("common:events.thinking");
  return result;
}

function parseCompaction(result: ParsedAgentEvent, event: AgentEventPayload): ParsedAgentEvent {
  // compaction 流：上下文压缩事件
  const phase = event.data.phase as string | undefined;
  result.status = "thinking";
  result.summary = i18n.t("common:events.compaction", { phase: phase ?? "" });
  return result;
}
