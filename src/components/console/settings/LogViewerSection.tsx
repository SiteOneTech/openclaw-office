import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowDown, Pause, Play, Square, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLogStore } from "@/store/console-stores/log-store";

export function LogViewerSection() {
  const { t } = useTranslation("console");
  const lines = useLogStore((s) => s.lines);
  const following = useLogStore((s) => s.following);
  const paused = useLogStore((s) => s.paused);
  const startFollow = useLogStore((s) => s.startFollow);
  const stopFollow = useLogStore((s) => s.stopFollow);
  const togglePause = useLogStore((s) => s.togglePause);
  const clearLogs = useLogStore((s) => s.clearLogs);

  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showNewIndicator, setShowNewIndicator] = useState(false);
  const prevLineCountRef = useRef(lines.length);

  useEffect(() => {
    return () => {
      useLogStore.getState().stopFollow();
    };
  }, []);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(isAtBottom);
    if (isAtBottom) setShowNewIndicator(false);
  }, []);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    } else if (lines.length > prevLineCountRef.current) {
      setShowNewIndicator(true);
    }
    prevLineCountRef.current = lines.length;
  }, [lines, autoScroll]);

  function scrollToBottom() {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setAutoScroll(true);
      setShowNewIndicator(false);
    }
  }

  const statusLabel = following
    ? paused
      ? t("settings.logs.paused")
      : t("settings.logs.following")
    : t("settings.logs.idle");

  const statusColor = following
    ? paused
      ? "text-amber-500"
      : "text-green-500"
    : "text-gray-400";

  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t("settings.logs.title")}
          </h3>
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${statusColor}`}>
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                following && !paused ? "animate-pulse bg-green-500" : paused ? "bg-amber-500" : "bg-gray-400"
              }`}
            />
            {statusLabel}
          </span>
          {lines.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {t("settings.logs.lineCount", { count: lines.length })}
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          {!following ? (
            <ToolbarButton
              icon={<Play className="h-3.5 w-3.5" />}
              label={t("settings.logs.startFollow")}
              onClick={startFollow}
            />
          ) : (
            <>
              <ToolbarButton
                icon={paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                label={paused ? t("settings.logs.resume") : t("settings.logs.pause")}
                onClick={togglePause}
              />
              <ToolbarButton
                icon={<Square className="h-3.5 w-3.5" />}
                label={t("settings.logs.stopFollow")}
                onClick={stopFollow}
              />
            </>
          )}
          <ToolbarButton
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label={t("settings.logs.clear")}
            onClick={clearLogs}
          />
        </div>
      </div>

      {/* Log content */}
      <div className="relative">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-72 overflow-y-auto bg-gray-950 p-4 font-mono text-xs leading-5 text-gray-300 scrollbar-thin"
        >
          {lines.length === 0 ? (
            <p className="text-gray-500 text-center pt-24">{t("settings.logs.noLogs")}</p>
          ) : (
            lines.map((line, i) => <LogLine key={i} line={line} />)
          )}
        </div>

        {/* New logs indicator */}
        {showNewIndicator && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-lg hover:bg-blue-700 transition-colors"
          >
            <ArrowDown className="h-3 w-3" />
            {t("settings.logs.newLogs")}
          </button>
        )}
      </div>
    </div>
  );
}

function LogLine({ line }: { line: string }) {
  let colorClass = "text-gray-300";
  if (line.includes("[ERROR]")) colorClass = "text-red-400";
  else if (line.includes("[WARN]")) colorClass = "text-amber-400";
  else if (line.includes("[DEBUG]")) colorClass = "text-gray-500";

  return (
    <div className={`whitespace-pre-wrap break-all ${colorClass} hover:bg-gray-900/50`}>
      {line}
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
