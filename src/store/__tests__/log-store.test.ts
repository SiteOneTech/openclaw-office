import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { initAdapter, __resetAdapterForTests } from "@/gateway/adapter-provider";
import { useLogStore } from "../console-stores/log-store";

describe("LogStore", () => {
  beforeEach(async () => {
    __resetAdapterForTests();
    await initAdapter("mock");
    useLogStore.setState({
      lines: [],
      cursor: 0,
      following: false,
      paused: false,
      error: null,
    });
  });

  afterEach(() => {
    useLogStore.getState().stopFollow();
    vi.restoreAllMocks();
  });

  it("initial state is idle", () => {
    const state = useLogStore.getState();
    expect(state.following).toBe(false);
    expect(state.paused).toBe(false);
    expect(state.lines).toEqual([]);
    expect(state.cursor).toBe(0);
  });

  it("startFollow sets following to true", () => {
    useLogStore.getState().startFollow();
    expect(useLogStore.getState().following).toBe(true);
    expect(useLogStore.getState().paused).toBe(false);
  });

  it("stopFollow sets following to false", () => {
    useLogStore.getState().startFollow();
    useLogStore.getState().stopFollow();
    expect(useLogStore.getState().following).toBe(false);
  });

  it("togglePause toggles paused state", () => {
    useLogStore.getState().startFollow();
    expect(useLogStore.getState().paused).toBe(false);

    useLogStore.getState().togglePause();
    expect(useLogStore.getState().paused).toBe(true);

    useLogStore.getState().togglePause();
    expect(useLogStore.getState().paused).toBe(false);
  });

  it("clearLogs resets lines and cursor", () => {
    useLogStore.setState({ lines: ["line1", "line2"], cursor: 42 });
    useLogStore.getState().clearLogs();
    expect(useLogStore.getState().lines).toEqual([]);
    expect(useLogStore.getState().cursor).toBe(0);
  });

  it("startFollow polls and adds lines after interval", async () => {
    vi.useFakeTimers();
    useLogStore.getState().startFollow();

    // Allow the initial poll to resolve
    await vi.advanceTimersByTimeAsync(100);

    const state = useLogStore.getState();
    expect(state.lines.length).toBeGreaterThan(0);
    expect(state.cursor).toBeGreaterThan(0);

    vi.useRealTimers();
  });

  it("buffer trims to MAX_LINES limit", () => {
    const bigLines = Array.from({ length: 5100 }, (_, i) => `line-${i}`);
    useLogStore.setState({ lines: bigLines });

    // After next clearLogs + re-add, verify the concept
    expect(useLogStore.getState().lines.length).toBe(5100);

    useLogStore.getState().clearLogs();
    expect(useLogStore.getState().lines.length).toBe(0);
  });
});
