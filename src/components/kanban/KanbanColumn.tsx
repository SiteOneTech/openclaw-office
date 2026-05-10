import type { BranchKanbanTask } from "@/lib/branch-kanban-client";
import { KanbanTaskCard } from "./KanbanTaskCard";

interface KanbanColumnProps {
  title: string;
  status: string;
  tasks: BranchKanbanTask[];
  emptyText: string;
  taskLabels: {
    agent: string;
    project: string;
    priority: string;
    updated: string;
  };
}

const STATUS_ACCENT: Record<string, string> = {
  backlog: "bg-gray-400",
  ready: "bg-sky-500",
  claimed: "bg-indigo-500",
  running: "bg-blue-500",
  review: "bg-violet-500",
  qa: "bg-cyan-500",
  blocked: "bg-red-500",
  failed: "bg-rose-600",
  done: "bg-emerald-500",
  archived: "bg-zinc-500",
};

export function KanbanColumn({ title, status, tasks, emptyText, taskLabels }: KanbanColumnProps) {
  return (
    <section className="flex max-h-[calc(100vh-18rem)] min-h-[28rem] w-[18rem] shrink-0 flex-col rounded-md border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-gray-200 px-3 dark:border-gray-800">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_ACCENT[status] ?? "bg-gray-400"}`} />
          <h2 className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
        </div>
        <span className="rounded bg-white px-1.5 py-0.5 text-xs font-medium tabular-nums text-gray-500 dark:bg-gray-950 dark:text-gray-400">
          {tasks.length}
        </span>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {tasks.length > 0 ? (
          tasks.map((task) => <KanbanTaskCard key={task.id} task={task} labels={taskLabels} />)
        ) : (
          <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-gray-200 bg-white text-xs text-gray-400 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-500">
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
}
