import { useChatDockStore } from "@/store/console-stores/chat-dock-store";

interface ContentBlock {
  type?: string;
  text?: string;
}

/**
 * Extract visible text from a streaming message payload.
 * Supports: string content, content-block arrays, and fallback to `text` field.
 */
export function extractStreamingTextFromMessage(
  streamingMessage: Record<string, unknown> | null,
): string {
  if (!streamingMessage) return "";

  const content = streamingMessage.content;
  if (typeof content === "string" && content.length > 0) return content;

  if (Array.isArray(content)) {
    const text = (content as ContentBlock[])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n");
    if (text.length > 0) return text;
  }

  const fallback = streamingMessage.text;
  if (typeof fallback === "string" && fallback.length > 0) return fallback;

  return "";
}

/**
 * Extract thinking text from a streaming message payload.
 * Supports structured `type: "thinking"` blocks and `<thinking>` / `<antThinking>` tags.
 */
export function extractThinkingFromMessage(
  streamingMessage: Record<string, unknown> | null,
): string {
  if (!streamingMessage) return "";

  const thinking = streamingMessage.thinking;
  if (typeof thinking === "string" && thinking.length > 0) return thinking;

  if (Array.isArray(streamingMessage.content)) {
    const blocks = streamingMessage.content as ContentBlock[];
    const thinkingText = blocks
      .filter((b) => b.type === "thinking" && b.text)
      .map((b) => b.text!)
      .join("\n");
    if (thinkingText.length > 0) return thinkingText;
  }

  const text = extractStreamingTextFromMessage(streamingMessage);
  if (text) {
    const tagMatch = text.match(
      /<(?:thinking|antThinking)>([\s\S]*?)<\/(?:thinking|antThinking)>/,
    );
    if (tagMatch?.[1]) return tagMatch[1].trim();
  }

  return "";
}

/**
 * Strip thinking tags from visible text so the bubble only shows the actual reply.
 */
export function stripThinkingTags(text: string): string {
  return text
    .replace(/<(?:thinking|antThinking)>[\s\S]*?<\/(?:thinking|antThinking)>/g, "")
    .trim();
}

/**
 * React hook that derives streaming text + thinking from the chat-dock store.
 */
export function useChatStreamingText(): {
  streamingText: string;
  thinkingText: string;
} {
  const streamingMessage = useChatDockStore((s) => s.streamingMessage);
  const rawText = extractStreamingTextFromMessage(streamingMessage);
  const thinkingText = extractThinkingFromMessage(streamingMessage);
  const streamingText = thinkingText ? stripThinkingTags(rawText) : rawText;
  return { streamingText, thinkingText };
}
