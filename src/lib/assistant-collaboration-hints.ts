import type { VisualAgent } from "@/gateway/types";

const COLLABORATION_HINTS = [
  "sessions_send",
  "thread=true",
  "直接通话",
  "互相调用",
  "双向协作",
  "协作链路",
] as const;

function normalizeText(text: string): string {
  return text.toLowerCase();
}

function hasCollaborationHint(text: string): boolean {
  return COLLABORATION_HINTS.some((hint) => text.includes(hint));
}

function buildAgentAliases(agent: VisualAgent): string[] {
  return [agent.id, agent.name]
    .filter((value): value is string => typeof value === "string" && value.trim().length >= 2)
    .map((value) => normalizeText(value.trim()));
}

export function detectPeerAgentHintsFromAssistantText(
  text: string,
  currentAgentId: string,
  agents: Iterable<VisualAgent>,
): string[] {
  const normalized = normalizeText(text);
  if (!hasCollaborationHint(normalized)) {
    return [];
  }

  const matches = new Set<string>();
  for (const agent of agents) {
    if (agent.isSubAgent || agent.isPlaceholder || agent.id === currentAgentId) {
      continue;
    }
    const aliases = buildAgentAliases(agent);
    if (aliases.some((alias) => normalized.includes(alias))) {
      matches.add(agent.id);
    }
  }

  return Array.from(matches);
}
