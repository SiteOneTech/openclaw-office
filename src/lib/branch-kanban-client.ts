export type KanbanStatus =
  | "backlog"
  | "ready"
  | "claimed"
  | "running"
  | "review"
  | "qa"
  | "blocked"
  | "failed"
  | "done"
  | "archived";

export interface BranchKanbanTask {
  id: string;
  title: string;
  description?: string;
  status: KanbanStatus | string;
  priority?: number;
  agent_id?: string | null;
  role?: string | null;
  project_id?: string | null;
  initiative_id?: string | null;
  source?: string | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  metadata?: Record<string, unknown>;
}

export interface BranchKanbanEvent {
  id: number;
  task_id?: string | null;
  branch: string;
  board: string;
  agent_id?: string | null;
  event_type: string;
  message?: string;
  status?: string | null;
  created_at?: string;
  metadata?: Record<string, unknown>;
}

export interface BranchKanbanSummary {
  task_count: number;
  active_count: number;
  blocked_or_failed_count: number;
  stale_running_count: number;
  stale_after_minutes: number;
  counts_by_status: Record<string, number>;
  counts_by_agent: Record<string, number>;
  counts_by_project: Record<string, number>;
}

export interface BranchKanbanReport {
  ok: boolean;
  schema: string;
  generated_at?: string;
  branch: string;
  board: string;
  summary: BranchKanbanSummary;
  columns?: Record<string, BranchKanbanTask[]>;
  active_tasks?: BranchKanbanTask[];
  blocked_or_failed_tasks?: BranchKanbanTask[];
  stale_running_tasks?: BranchKanbanTask[];
  recent_events?: BranchKanbanEvent[];
}

export async function fetchBranchKanban(signal?: AbortSignal): Promise<BranchKanbanReport> {
  const res = await fetch("/api/branch-kanban", {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    const message = typeof data?.error === "string" ? data.error : `Kanban request failed (${res.status})`;
    throw new Error(message);
  }
  return data as BranchKanbanReport;
}
