import { useEffect, useRef } from "react";
import type { GatewayRpcClient } from "@/gateway/rpc-client";
import type { TokenSnapshot } from "@/gateway/types";
import { useOfficeStore } from "@/store/office-store";
import { toSubAgentInfoList, type SessionEntry } from "./useSubAgentPoller";

const POLL_INTERVAL_MS = 60_000;
const FAILURE_THRESHOLD = 3;

interface SessionsListResponse {
  sessions?: SessionEntry[];
}

interface UsageCostResponse {
  byAgent?: Record<string, number>;
  costs?: Record<string, number>;
}

interface SessionsUsageByAgentRow {
  agentId?: string;
  totals?: {
    totalCost?: number;
  };
}

interface SessionsUsageResponse {
  aggregates?: {
    byAgent?: SessionsUsageByAgentRow[];
  };
}

export function useUsagePoller(rpcRef: React.RefObject<GatewayRpcClient | null>) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failureCountRef = useRef(0);

  const connectionStatus = useOfficeStore((s) => s.connectionStatus);
  const pushTokenSnapshot = useOfficeStore((s) => s.pushTokenSnapshot);
  const setAgentCosts = useOfficeStore((s) => s.setAgentCosts);
  const setSessionsSnapshot = useOfficeStore((s) => s.setSessionsSnapshot);

  useEffect(() => {
    if (connectionStatus !== "connected" || !rpcRef.current) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const poll = async () => {
      const rpc = rpcRef.current;
      if (!rpc) {
        return;
      }

      try {
        const [sessionsResp, sessionsUsageResp, costResp] = await Promise.all([
          rpc.request<SessionsListResponse>("sessions.list"),
          rpc.request<SessionsUsageResponse>("sessions.usage").catch(() => null),
          rpc.request<UsageCostResponse>("usage.cost").catch(() => null),
        ]);

        failureCountRef.current = 0;

        const fetchedAt = Date.now();
        const sessionRows = sessionsResp?.sessions ?? [];
        setSessionsSnapshot({
          sessions: toSubAgentInfoList(sessionRows),
          fetchedAt,
        });

        const snapshot = buildSnapshotFromSessions(sessionRows);

        if (snapshot) {
          pushTokenSnapshot(snapshot);
        }

        const costs =
          buildAgentCostsFromSessionsUsage(sessionsUsageResp) ?? costResp?.byAgent ?? costResp?.costs ?? {};
        if (Object.keys(costs).length > 0) {
          setAgentCosts(costs);
        }
      } catch {
        failureCountRef.current += 1;

        if (failureCountRef.current >= FAILURE_THRESHOLD) {
          const history = useOfficeStore.getState().eventHistory;
          const snapshot = estimateFromEventHistory(history);
          if (snapshot) {
            pushTokenSnapshot(snapshot);
          }
        }
      }
    };

    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    poll();

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [connectionStatus, pushTokenSnapshot, setAgentCosts, setSessionsSnapshot]);
}

export function buildSnapshotFromSessions(sessions: SessionEntry[]): TokenSnapshot | null {
  const byAgent: Record<string, number> = {};
  let total = 0;

  for (const session of sessions) {
    if (session.totalTokensFresh === false) {
      continue;
    }
    if (typeof session.totalTokens !== "number" || !Number.isFinite(session.totalTokens)) {
      continue;
    }
    const agentId = extractAgentIdFromSessionKey(session.key);
    if (!agentId) {
      continue;
    }
    byAgent[agentId] = (byAgent[agentId] ?? 0) + session.totalTokens;
    total += session.totalTokens;
  }

  if (total === 0) {
    return null;
  }

  return {
    timestamp: Date.now(),
    total,
    byAgent,
  };
}

function extractAgentIdFromSessionKey(sessionKey: string | undefined): string | null {
  const match = /^agent:([^:]+):/.exec(sessionKey ?? "");
  return match?.[1] ?? null;
}

export function buildAgentCostsFromSessionsUsage(
  response: SessionsUsageResponse | null | undefined,
): Record<string, number> | null {
  const rows = response?.aggregates?.byAgent;
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const costs: Record<string, number> = {};
  for (const row of rows) {
    if (!row?.agentId) {
      continue;
    }
    const totalCost = row.totals?.totalCost;
    if (typeof totalCost !== "number" || !Number.isFinite(totalCost) || totalCost <= 0) {
      continue;
    }
    costs[row.agentId] = totalCost;
  }

  return Object.keys(costs).length > 0 ? costs : null;
}

function estimateFromEventHistory(
  history: { timestamp: number; agentId: string; stream: string }[],
): TokenSnapshot | null {
  const byAgent: Record<string, number> = {};
  let total = 0;

  for (const item of history) {
    if (item.stream !== "tool") {
      continue;
    }
    const tokens = 100;
    byAgent[item.agentId] = (byAgent[item.agentId] ?? 0) + tokens;
    total += tokens;
  }

  if (total === 0) {
    return null;
  }

  return {
    timestamp: Date.now(),
    total,
    byAgent,
  };
}
