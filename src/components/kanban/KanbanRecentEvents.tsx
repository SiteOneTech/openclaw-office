import { GitBranch } from "lucide-react";
import type { BranchKanbanEvent } from "@/lib/branch-kanban-client";

interface KanbanRecentEventsProps {
  events: BranchKanbanEvent[];
  title: string;
  emptyText: string;
}

export function KanbanRecentEvents({ events, title, emptyText }: KanbanRecentEventsProps) {
  return (
    <section className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <header className="flex h-11 items-center gap-2 border-b border-gray-200 px-4 dark:border-gray-800">
        <GitBranch className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
      </header>
      <div className="max-h-60 overflow-y-auto p-2">
        {events.length > 0 ? (
          <ol className="space-y-1">
            {events.slice(0, 12).map((event) => (
              <li
                key={event.id}
                className="grid grid-cols-[9rem_minmax(0,1fr)_auto] items-center gap-3 rounded px-2 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <span className="truncate font-medium text-gray-700 dark:text-gray-300">
                  {event.event_type}
                </span>
                <span className="truncate text-gray-500 dark:text-gray-400">
                  {event.message || event.task_id || event.agent_id || "—"}
                </span>
                <span className="shrink-0 text-gray-400">{event.created_at ? formatTime(event.created_at) : ""}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex h-24 items-center justify-center text-sm text-gray-400 dark:text-gray-500">
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
