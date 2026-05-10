import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { waitForAdapter } from "@/gateway/adapter-provider";
import type { AgentSummary } from "@/gateway/types";
import { useChatDockStore } from "@/store/console-stores/chat-dock-store";
import { useOfficeStore } from "@/store/office-store";

interface AgentSelectorProps {
  className?: string;
}

export function AgentSelector({ className = "" }: AgentSelectorProps) {
  const { t } = useTranslation("chat");
  const [open, setOpen] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<AgentSummary[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const agents = useOfficeStore((s) => s.agents);
  const targetAgentId = useChatDockStore((s) => s.targetAgentId);
  const setTargetAgent = useChatDockStore((s) => s.setTargetAgent);

  useEffect(() => {
    let cancelled = false;

    void waitForAdapter()
      .then((adapter) => adapter.agentsList())
      .then((result) => {
        if (cancelled) return;
        setAvailableAgents(result.agents);
      })
      .catch(() => {
        if (cancelled) return;
        setAvailableAgents([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const fallbackAgents = Array.from(agents.values())
    .filter((agent) => !agent.isPlaceholder && !agent.isSubAgent)
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
    }));
  const rawAgentList = availableAgents.length > 0 ? availableAgents : fallbackAgents;
  const agentList = rawAgentList.map((agent) => ({
    ...agent,
    name: resolveAgentDisplayName(agent, agents),
  }));
  const currentAgent =
    agentList.find((agent) => agent.id === targetAgentId) ??
    agentList.find((agent) => agent.id === "main") ??
    agentList[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  if (agentList.length === 0) return null;

  return (
    <div className={`relative ${className}`.trim()} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-300"
      >
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: getAgentColor(currentAgent?.id ?? "") }}
        />
        <span className="max-w-[120px] truncate">
          {currentAgent?.name ?? t("agentSelector.defaultLabel")}
        </span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 min-w-[200px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {agentList.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => {
                setTargetAgent(agent.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
                agent.id === targetAgentId
                  ? "bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                  : "text-gray-600 dark:text-gray-300"
              }`}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: getAgentColor(agent.id) }}
              />
              <span className="truncate">{agent.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getAgentColor(id: string): string {
  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

function resolveAgentDisplayName(
  agent: Pick<AgentSummary, "id" | "name" | "identity">,
  officeAgents: Map<string, { name: string }>,
): string {
  const normalized = [
    agent.identity?.name,
    agent.name,
    officeAgents.get(agent.id)?.name,
    agent.id,
  ]
    .map((value) => value?.trim())
    .find((value) => Boolean(value));
  return normalized ?? agent.id;
}
