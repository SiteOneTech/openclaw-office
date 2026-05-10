import { UserRound } from "lucide-react";
import type { BranchKanbanTask } from "@/lib/branch-kanban-client";

interface KanbanTaskCardProps {
  task: BranchKanbanTask;
  labels: {
    agent: string;
    project: string;
    priority: string;
    updated: string;
  };
}

export function KanbanTaskCard({ task, labels }: KanbanTaskCardProps) {
  return (
    <article className="rounded-md border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-sm font-semibold leading-5 text-gray-900 dark:text-gray-100">
          {task.title || task.id}
        </h3>
        {typeof task.priority === "number" && (
          <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {labels.priority} {task.priority}
          </span>
        )}
      </div>

      {task.description && (
        <p className="mt-2 line-clamp-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
          {task.description}
        </p>
      )}

      <dl className="mt-3 grid gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        {task.agent_id && (
          <div className="flex min-w-0 items-center gap-1.5">
            <UserRound className="h-3.5 w-3.5 shrink-0" />
            <dt className="sr-only">{labels.agent}</dt>
            <dd className="truncate font-medium text-gray-700 dark:text-gray-300">{task.agent_id}</dd>
          </div>
        )}
        {task.project_id && (
          <div className="flex min-w-0 gap-1.5">
            <dt className="shrink-0 text-gray-400">{labels.project}</dt>
            <dd className="truncate">{task.project_id}</dd>
          </div>
        )}
        {task.updated_at && (
          <div className="flex min-w-0 gap-1.5">
            <dt className="shrink-0 text-gray-400">{labels.updated}</dt>
            <dd className="truncate">{formatTimestamp(task.updated_at)}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
