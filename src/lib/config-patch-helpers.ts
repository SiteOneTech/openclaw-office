import type { GatewayAdapter } from "@/gateway/adapter";
import type { AgentModelConfig } from "@/gateway/adapter-types";

interface AgentConfigEntry extends Record<string, unknown> {
  id: string;
  model?: AgentModelConfig;
  tools?: Record<string, unknown>;
  skills?: string[];
}

export interface PatchResult {
  ok: boolean;
  error?: string;
  restart?: { scheduled: boolean; delayMs: number };
}

export function extractAgentConfig(
  config: Record<string, unknown>,
  agentId: string,
): AgentConfigEntry | undefined {
  const agents = config.agents as Record<string, unknown> | undefined;
  if (!agents) return undefined;
  const list = agents.list as AgentConfigEntry[] | undefined;
  if (!Array.isArray(list)) return undefined;
  return list.find((entry) => entry.id === agentId);
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export function normalizeAgentModelConfig(
  model: AgentModelConfig,
): string | { primary?: string; fallbacks?: string[] } | undefined {
  if (typeof model === "string") {
    const primary = model.trim();
    return primary.length > 0 ? primary : undefined;
  }

  const primary = model.primary?.trim();
  const fallbacks = (model.fallbacks ?? []).map((v) => v.trim()).filter((v) => v.length > 0);

  if (!primary && fallbacks.length === 0) return undefined;
  if (fallbacks.length === 0) return primary;

  return {
    ...(primary ? { primary } : {}),
    fallbacks,
  };
}

export async function patchAgentToolsConfig(
  adapter: GatewayAdapter,
  agentId: string,
  toolsConfig: Record<string, unknown>,
  baseHash?: string,
): Promise<PatchResult> {
  try {
    const snapshot = await adapter.configGet();
    const config = snapshot.config;
    const agent = extractAgentConfig(config, agentId);
    if (!agent) return { ok: false, error: "agent_not_found" };

    const updated = deepClone(config);
    const updatedAgents = updated.agents as Record<string, unknown>;
    const updatedList = updatedAgents.list as AgentConfigEntry[];
    const idx = updatedList.findIndex((e) => e.id === agentId);
    if (idx < 0) return { ok: false, error: "agent_not_found" };

    updatedList[idx] = { ...updatedList[idx], tools: toolsConfig };

    const result = await adapter.configSet(
      JSON.stringify(updated),
      baseHash ?? snapshot.hash,
    );
    if (!result.ok) {
      return { ok: false, error: result.error ?? "conflict" };
    }
    return { ok: true, restart: result.restart ?? undefined };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function patchAgentSkillsConfig(
  adapter: GatewayAdapter,
  agentId: string,
  skills: string[] | null,
  baseHash?: string,
): Promise<PatchResult> {
  try {
    const snapshot = await adapter.configGet();
    const config = snapshot.config;
    const agent = extractAgentConfig(config, agentId);
    if (!agent) return { ok: false, error: "agent_not_found" };

    const updated = deepClone(config);
    const updatedAgents = updated.agents as Record<string, unknown>;
    const updatedList = updatedAgents.list as AgentConfigEntry[];
    const idx = updatedList.findIndex((e) => e.id === agentId);
    if (idx < 0) return { ok: false, error: "agent_not_found" };

    if (skills === null) {
      const { skills: _removed, ...rest } = updatedList[idx];
      updatedList[idx] = rest as AgentConfigEntry;
    } else {
      updatedList[idx] = { ...updatedList[idx], skills };
    }

    const result = await adapter.configSet(
      JSON.stringify(updated),
      baseHash ?? snapshot.hash,
    );
    if (!result.ok) {
      return { ok: false, error: result.error ?? "conflict" };
    }
    return { ok: true, restart: result.restart ?? undefined };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function patchAgentModelConfig(
  adapter: GatewayAdapter,
  agentId: string,
  model: AgentModelConfig,
  baseHash?: string,
): Promise<PatchResult> {
  try {
    const snapshot = await adapter.configGet();
    const config = snapshot.config;
    const agent = extractAgentConfig(config, agentId);
    if (!agent) return { ok: false, error: "agent_not_found" };

    const updated = deepClone(config);
    const updatedAgents = updated.agents as Record<string, unknown>;
    const updatedList = updatedAgents.list as AgentConfigEntry[];
    const idx = updatedList.findIndex((e) => e.id === agentId);
    if (idx < 0) return { ok: false, error: "agent_not_found" };

    const nextModel = normalizeAgentModelConfig(model);
    if (nextModel === undefined) {
      const { model: _removed, ...rest } = updatedList[idx];
      updatedList[idx] = rest as AgentConfigEntry;
    } else {
      updatedList[idx] = { ...updatedList[idx], model: nextModel };
    }

    const result = await adapter.configSet(JSON.stringify(updated), baseHash ?? snapshot.hash);
    if (!result.ok) {
      return { ok: false, error: result.error ?? "conflict" };
    }
    return { ok: true, restart: result.restart ?? undefined };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
