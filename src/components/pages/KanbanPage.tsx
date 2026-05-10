import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { KanbanRecentEvents } from "@/components/kanban/KanbanRecentEvents";
import { KanbanSummaryStrip } from "@/components/kanban/KanbanSummaryStrip";
import { fetchBranchKanban, type BranchKanbanReport, type BranchKanbanTask } from "@/lib/branch-kanban-client";
import { getBranchLabel } from "@/lib/runtime-config";

const STATUS_ORDER = [
  "backlog",
  "ready",
  "claimed",
  "running",
  "review",
  "qa",
  "blocked",
  "failed",
  "done",
  "archived",
] as const;

export function KanbanPage() {
  const { t } = useTranslation("kanban");
  const { t: tc } = useTranslation("common");
  const branchLabel = getBranchLabel("sicilia");
  const [report, setReport] = useState<BranchKanbanReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchBranchKanban(signal);
      setReport(next);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    const timer = window.setInterval(() => refresh(), 30_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [refresh]);

  const columns = useMemo(() => normalizeColumns(report), [report]);

  if (loading && !report) {
    return (
      <PageFrame title={t("title")} subtitle={t("subtitle", { branch: branchLabel })}>
        <div className="flex h-80 items-center justify-center rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title={t("title")}
      subtitle={t("subtitle", { branch: report?.branch || branchLabel })}
      rightSlot={
        <button
          type="button"
          onClick={() => refresh()}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 sm:w-auto sm:px-3"
          disabled={loading}
          title={tc("actions.refresh")}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">{tc("actions.refresh")}</span>
        </button>
      }
    >
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{error}</span>
        </div>
      )}

      {report && (
        <>
          <KanbanSummaryStrip
            summary={report.summary}
            labels={{
              total: t("summary.total"),
              active: t("summary.active"),
              blocked: t("summary.blocked"),
              stale: t("summary.stale"),
            }}
          />

          <div className="max-w-full overflow-x-auto pb-2">
            <div className="flex min-w-max gap-3">
              {STATUS_ORDER.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  title={t(`statuses.${status}`)}
                  tasks={columns[status] ?? []}
                  emptyText={t("emptyColumn")}
                  taskLabels={{
                    agent: t("task.agent"),
                    project: t("task.project"),
                    priority: t("task.priority"),
                    updated: t("task.updated"),
                  }}
                />
              ))}
            </div>
          </div>

          <KanbanRecentEvents
            events={report.recent_events ?? []}
            title={t("recentEvents")}
            emptyText={t("emptyEvents")}
          />
        </>
      )}
    </PageFrame>
  );
}

function PageFrame({
  title,
  subtitle,
  rightSlot,
  children,
}: {
  title: string;
  subtitle: string;
  rightSlot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="h-full overflow-auto bg-gray-50 px-5 py-5 dark:bg-gray-950">
      <div className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-col gap-5">
        <header className="flex min-h-12 flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-gray-950 dark:text-gray-100">{title}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
          </div>
          {rightSlot}
        </header>
        {children}
      </div>
    </div>
  );
}

function normalizeColumns(report: BranchKanbanReport | null): Record<string, BranchKanbanTask[]> {
  if (!report) {
    return {};
  }
  if (report.columns) {
    return report.columns;
  }
  const grouped: Record<string, BranchKanbanTask[]> = {};
  for (const task of report.active_tasks ?? []) {
    const status = task.status || "backlog";
    grouped[status] = [...(grouped[status] ?? []), task];
  }
  return grouped;
}
