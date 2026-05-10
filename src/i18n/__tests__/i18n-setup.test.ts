import { describe, it, expect, afterEach } from "vitest";
import i18n from "@/i18n/test-setup";

describe("i18n setup", () => {
  afterEach(() => {
    i18n.changeLanguage("zh");
  });

  it("initializes with zh as default language", () => {
    expect(i18n.language).toBe("zh");
  });

  it("loads all namespaces", () => {
    const expected = ["common", "layout", "office", "panels", "chat", "console"];
    for (const ns of expected) {
      expect(i18n.hasResourceBundle("zh", ns)).toBe(true);
      expect(i18n.hasResourceBundle("en", ns)).toBe(true);
    }
  });

  it("translates common keys in zh", () => {
    expect(i18n.t("common:status.connected")).toBe("已连接");
    expect(i18n.t("common:actions.send")).toBe("发送");
    expect(i18n.t("common:empty.noEvents")).toBe("暂无事件");
  });

  it("translates common keys in en", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("common:status.connected")).toBe("Connected");
    expect(i18n.t("common:actions.send")).toBe("Send");
    expect(i18n.t("common:empty.noEvents")).toBe("No events yet");
  });

  it("supports interpolation", () => {
    expect(i18n.t("common:time.secondsAgo", { count: 5 })).toBe("5秒前");
  });

  it("supports interpolation in en", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("common:time.secondsAgo", { count: 5 })).toBe("5s ago");
  });

  it("falls back to zh for unsupported language", async () => {
    await i18n.changeLanguage("ja");
    expect(i18n.t("common:status.connected")).toBe("已连接");
  });

  it("translates layout namespace", () => {
    expect(i18n.t("layout:topbar.console")).toBe("控制台");
    expect(i18n.t("layout:sidebar.searchPlaceholder")).toBe("搜索 Agent...");
  });

  it("translates office namespace", () => {
    expect(i18n.t("office:loading3D")).toBe("加载 3D 场景...");
    expect(i18n.t("office:zones.desk")).toBe("固定工位区");
  });

  it("translates chat namespace", () => {
    expect(i18n.t("chat:dock.placeholder")).toBe("输入消息... (Enter 发送, Shift+Enter 换行)");
  });
});
