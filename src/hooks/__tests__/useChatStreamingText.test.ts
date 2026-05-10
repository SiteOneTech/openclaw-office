import { describe, expect, it } from "vitest";
import {
  extractStreamingTextFromMessage,
  extractThinkingFromMessage,
  stripThinkingTags,
} from "../useChatStreamingText";

describe("extractStreamingTextFromMessage", () => {
  it("returns empty string for null", () => {
    expect(extractStreamingTextFromMessage(null)).toBe("");
  });

  it("extracts plain string content", () => {
    expect(extractStreamingTextFromMessage({ content: "hello world" })).toBe("hello world");
  });

  it("extracts text from content blocks array", () => {
    const msg = {
      content: [
        { type: "text", text: "part 1" },
        { type: "image", url: "..." },
        { type: "text", text: "part 2" },
      ],
    };
    expect(extractStreamingTextFromMessage(msg)).toBe("part 1\npart 2");
  });

  it("falls back to text field when content is empty", () => {
    expect(extractStreamingTextFromMessage({ content: "", text: "fallback" })).toBe("fallback");
  });

  it("falls back to text field when content is missing", () => {
    expect(extractStreamingTextFromMessage({ text: "fallback only" })).toBe("fallback only");
  });

  it("returns empty for empty object", () => {
    expect(extractStreamingTextFromMessage({})).toBe("");
  });

  it("returns empty for content blocks with no text type", () => {
    const msg = { content: [{ type: "image", url: "..." }] };
    expect(extractStreamingTextFromMessage(msg)).toBe("");
  });
});

describe("extractThinkingFromMessage", () => {
  it("returns empty for null", () => {
    expect(extractThinkingFromMessage(null)).toBe("");
  });

  it("extracts from thinking field", () => {
    expect(extractThinkingFromMessage({ thinking: "let me think..." })).toBe("let me think...");
  });

  it("extracts from thinking content blocks", () => {
    const msg = {
      content: [
        { type: "thinking", text: "analyzing..." },
        { type: "text", text: "response" },
      ],
    };
    expect(extractThinkingFromMessage(msg)).toBe("analyzing...");
  });

  it("extracts from <thinking> tags", () => {
    const msg = { content: "text <thinking>deep thought</thinking> more text" };
    expect(extractThinkingFromMessage(msg)).toBe("deep thought");
  });

  it("extracts from <antThinking> tags", () => {
    const msg = { content: "text <antThinking>reasoning</antThinking> output" };
    expect(extractThinkingFromMessage(msg)).toBe("reasoning");
  });

  it("returns empty when no thinking present", () => {
    expect(extractThinkingFromMessage({ content: "no thinking here" })).toBe("");
  });
});

describe("stripThinkingTags", () => {
  it("strips <thinking> tags", () => {
    expect(stripThinkingTags("before <thinking>hidden</thinking> after")).toBe("before  after");
  });

  it("strips <antThinking> tags", () => {
    expect(stripThinkingTags("start <antThinking>secret</antThinking> end")).toBe("start  end");
  });

  it("returns original text when no tags", () => {
    expect(stripThinkingTags("plain text")).toBe("plain text");
  });
});
