import type { ChatDockMessage } from "@/store/console-stores/chat-dock-store";

function escapeMarkdown(text: string): string {
  return text.replace(/```/g, "\\`\\`\\`");
}

export function buildChatTranscriptMarkdown(
  messages: ChatDockMessage[],
  sessionKey: string,
): string {
  const lines = [`# OpenClaw Chat Export`, "", `- Session: \`${sessionKey}\``, ""];

  for (const message of messages) {
    const role = message.role.charAt(0).toUpperCase() + message.role.slice(1);
    const time = new Date(message.timestamp).toLocaleString();
    lines.push(`## ${role} · ${time}`);
    lines.push("");
    lines.push(escapeMarkdown(message.content || "_(empty)_"));
    lines.push("");
  }

  return lines.join("\n");
}

export function exportChatTranscriptMarkdown(
  messages: ChatDockMessage[],
  sessionKey: string,
): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  const markdown = buildChatTranscriptMarkdown(messages, sessionKey);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sessionKey.replace(/[^a-zA-Z0-9-_]+/g, "_") || "chat"}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return true;
}
