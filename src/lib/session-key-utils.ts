/**
 * SessionKey 工具函数
 *
 * OpenClaw Gateway 的 sessionKey 格式约定:
 *   主 Agent 会话:   agent:<agentId>:<type>       例: agent:main:main
 *   Sub-Agent 会话:  agent:<parentId>:subagent:<uuid>
 *   A2A 跨 agent 会话不共享 sessionKey，通过工具事件关联
 */

/**
 * 提取 sessionKey 的命名空间（agent:<id> 前缀）。
 * 例: "agent:main:subagent:xxx" → "agent:main"
 * 非标准格式返回 null。
 */
export function extractSessionNamespace(sessionKey: string): string | null {
  if (!sessionKey.startsWith("agent:")) return null;
  const rest = sessionKey.slice("agent:".length);
  const secondColon = rest.indexOf(":");
  if (secondColon === -1) return null;
  const agentId = rest.slice(0, secondColon);
  if (!agentId) return null;
  return `agent:${agentId}`;
}

/**
 * 判断是否是 sub-agent 的 sessionKey
 * Gateway 格式: "agent:<parentId>:subagent:<uuid>"
 */
export function isSubAgentSessionKey(sessionKey: string): boolean {
  return sessionKey.includes(":subagent:");
}

/**
 * 从 sub-agent sessionKey 中提取父 agent 的命名空间
 * 例: "agent:main:subagent:xxx" → "agent:main"
 */
export function extractParentNamespace(sessionKey: string): string | null {
  if (!isSubAgentSessionKey(sessionKey)) return null;
  return extractSessionNamespace(sessionKey);
}

/**
 * 从 sessionKey 中提取 agentId 部分
 * 例: "agent:main:main" → "main"
 * 例: "agent:main:subagent:uuid" → "main" (父 agent)
 */
export function extractAgentIdFromSessionKey(sessionKey: string): string | null {
  if (!sessionKey.startsWith("agent:")) return null;
  const rest = sessionKey.slice("agent:".length);
  const secondColon = rest.indexOf(":");
  if (secondColon === -1) return rest || null;
  return rest.slice(0, secondColon) || null;
}
