import { AlertTriangle, Activity, CheckCircle2, Clock3 } from "lucide-react";
import type { BranchKanbanSummary } from "@/lib/branch-kanban-client";

interface KanbanSummaryStripProps {
  summary: BranchKanbanSummary;
  labels: {
    total: string;
    active: string;
    blocked: string;
    stale: string;
  };
}

export function KanbanSummaryStrip({ summary, labels }: KanbanSummaryStripProps) {
  const items = [
    { label: labels.total, value: summary.task_count, icon: CheckCircle2, tone: "text-emerald-500" },
    { label: labels.active, value: summary.active_count, icon: Activity, tone: "text-blue-500" },
    { label: labels.blocked, value: summary.blocked_or_failed_count, icon: AlertTriangle, tone: "text-red-500" },
    { label: labels.stale, value: summary.stale_running_count, icon: Clock3, tone: "text-amber-500" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="flex min-h-20 items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900"
          >
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {item.label}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {item.value}
              </p>
            </div>
            <Icon className={`h-5 w-5 ${item.tone}`} />
          </div>
        );
      })}
    </div>
  );
}
