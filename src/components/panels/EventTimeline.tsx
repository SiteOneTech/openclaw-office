import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { STATUS_COLORS } from "@/lib/constants";
import { useOfficeStore } from "@/store/office-store";

const STREAM_ICONS: Record<string, string> = {
  lifecycle: "●",
  tool: "🔧",
  assistant: "💬",
  error: "⚠",
  item: "📋",
  plan: "📝",
  approval: "🔐",
  command_output: "⌨",
  patch: "📄",
  thinking: "💭",
  compaction: "🗜",
};

const STREAM_LABELS: Record<string, string> = {
  lifecycle: "生命周期",
  tool: "工具调用",
  assistant: "对话输出",
  error: "异常",
  item: "任务项",
  plan: "计划",
  approval: "审批",
  command_output: "命令输出",
  patch: "文件变更",
  thinking: "思考",
  compaction: "上下文压缩",
};

const MAX_DISPLAY = 50;

export function EventTimeline() {
  const { t } = useTranslation("panels");
  const eventHistory = useOfficeStore((s) => s.eventHistory);
  const selectAgent = useOfficeStore((s) => s.selectAgent);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevLenRef = useRef(0);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const displayEvents = eventHistory.slice(-MAX_DISPLAY);

  useEffect(() => {
    if (autoScroll && scrollRef.current && eventHistory.length > prevLenRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevLenRef.current = eventHistory.length;
  }, [eventHistory.length, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 30;
    setAutoScroll(atBottom);
  }, []);

  const handleRowClick = useCallback(
    (index: number, agentId: string) => {
      if (expandedIndex === index) {
        setExpandedIndex(null);
      } else {
        setExpandedIndex(index);
        selectAgent(agentId);
      }
    },
    [expandedIndex, selectAgent],
  );

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
      {!autoScroll && eventHistory.length > 0 && (
        <div className="sticky top-0 z-10 flex justify-end bg-white/80 px-2 py-0.5 backdrop-blur-sm dark:bg-gray-900/80">
          <button
            onClick={() => {
              setAutoScroll(true);
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }
            }}
            className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] text-white"
          >
            {t("eventTimeline.newEvents")}
          </button>
        </div>
      )}
      {displayEvents.map((evt, i) => {
        const isExpanded = expandedIndex === i;
        return (
          <div key={`${evt.timestamp}-${evt.agentId}-${i}`}>
            <button
              onClick={() => handleRowClick(i, evt.agentId)}
              className={`flex w-full items-start gap-1.5 border-b border-gray-100 px-3 py-1.5 text-left text-xs transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800 ${
                isExpanded ? "bg-blue-50/50 dark:bg-blue-950/30" : ""
              }`}
            >
              <span className="mt-0.5 shrink-0 text-gray-400">
                {new Date(evt.timestamp).toLocaleTimeString("en-US", {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <span className="shrink-0">{STREAM_ICONS[evt.stream] ?? "·"}</span>
              <span
                className="shrink-0 font-medium"
                style={{
                  color: STATUS_COLORS[evt.stream === "error" ? "error" : "thinking"],
                }}
              >
                {evt.agentName}
              </span>
              <span className="min-w-0 flex-1 truncate text-gray-500 dark:text-gray-400">
                {evt.summary}
              </span>
              <span className="shrink-0 text-[10px] text-gray-300 dark:text-gray-600">
                {isExpanded ? "▼" : "▶"}
              </span>
            </button>

            {isExpanded && (
              <div className="border-b border-gray-100 bg-gray-50/50 px-3 py-2 dark:border-gray-800 dark:bg-gray-800/50">
                <div className="space-y-1 text-[11px]">
                  <DetailRow label="类型" value={STREAM_LABELS[evt.stream] ?? evt.stream} />
                  <DetailRow label="Agent" value={`${evt.agentName} (${evt.agentId})`} />
                  <DetailRow
                    label="时间"
                    value={new Date(evt.timestamp).toLocaleString("zh-CN", {
                      hour12: false,
                    })}
                  />
                  <div className="pt-1">
                    <div className="text-gray-400 dark:text-gray-500">详情</div>
                    <div className="mt-0.5 whitespace-pre-wrap break-all rounded bg-white/60 p-1.5 text-gray-700 dark:bg-gray-900/60 dark:text-gray-300">
                      {(evt.fullText ?? evt.summary) || "—"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {displayEvents.length === 0 && (
        <div className="py-3 text-center text-xs text-gray-400 dark:text-gray-500">
          {t("common:empty.noEvents")}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-10 shrink-0 text-gray-400 dark:text-gray-500">{label}</span>
      <span className="min-w-0 break-all text-gray-600 dark:text-gray-300">{value}</span>
    </div>
  );
}
