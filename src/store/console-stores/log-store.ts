import { create } from "zustand";
import { waitForAdapter } from "@/gateway/adapter-provider";

const POLL_INTERVAL_MS = 1500;
const MAX_LINES = 5000;
const POLL_LIMIT = 200;

interface LogStoreState {
  lines: string[];
  cursor: number;
  following: boolean;
  paused: boolean;
  error: string | null;

  startFollow: () => void;
  stopFollow: () => void;
  togglePause: () => void;
  clearLogs: () => void;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;

async function pollOnce(
  set: (partial: Partial<LogStoreState> | ((s: LogStoreState) => Partial<LogStoreState>)) => void,
  get: () => LogStoreState,
): Promise<void> {
  const { paused, cursor } = get();
  if (paused) return;

  try {
    const adapter = await waitForAdapter(5000);
    const result = await adapter.logsTail({
      cursor: cursor || undefined,
      limit: POLL_LIMIT,
    });

    if (result.lines.length > 0) {
      set((s) => {
        const newLines = [...s.lines, ...result.lines];
        const trimmed =
          newLines.length > MAX_LINES
            ? newLines.slice(newLines.length - MAX_LINES)
            : newLines;
        return {
          lines: trimmed,
          cursor: result.cursor,
          error: null,
        };
      });
    }
    if (result.reset) {
      set({ lines: result.lines, cursor: result.cursor });
    }
  } catch (err) {
    set({ error: String(err) });
  }
}

export const useLogStore = create<LogStoreState>((set, get) => ({
  lines: [],
  cursor: 0,
  following: false,
  paused: false,
  error: null,

  startFollow: () => {
    if (get().following) return;
    set({ following: true, paused: false, error: null });

    void pollOnce(set, get);

    pollTimer = setInterval(() => {
      void pollOnce(set, get);
    }, POLL_INTERVAL_MS);

    // Visibility control: pause when tab is hidden, resume when visible
    visibilityHandler = () => {
      if (document.hidden) {
        set({ paused: true });
      } else if (get().following) {
        set({ paused: false });
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);
  },

  stopFollow: () => {
    set({ following: false });
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (visibilityHandler) {
      document.removeEventListener("visibilitychange", visibilityHandler);
      visibilityHandler = null;
    }
  },

  togglePause: () => {
    set((s) => ({ paused: !s.paused }));
  },

  clearLogs: () => {
    set({ lines: [], cursor: 0 });
  },
}));
