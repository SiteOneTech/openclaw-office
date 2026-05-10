/**
 * Agent ID 模糊匹配工具
 *
 * 匹配优先级：精确匹配 > 前缀匹配 > 包含匹配
 * 无匹配时返回 null。
 */
export function fuzzyMatchAgentId(query: string, agentIds: string[]): string | null {
  const q = query.toLowerCase();

  // 1. 精确匹配
  const exact = agentIds.find((id) => id.toLowerCase() === q);
  if (exact) return exact;

  // 2. 前缀匹配
  const prefix = agentIds.find((id) => id.toLowerCase().startsWith(q));
  if (prefix) return prefix;

  // 3. 包含匹配
  const contains = agentIds.find((id) => id.toLowerCase().includes(q));
  if (contains) return contains;

  return null;
}

/**
 * 批量模糊匹配：将 query 列表映射到匹配的 Agent ID。
 * 无法匹配的 query 会被 console.warn 并跳过。
 */
export function fuzzyMatchAgentIds(
  queries: string[],
  agentIds: string[],
  context = "fuzzyMatchAgentIds",
): string[] {
  const matched: string[] = [];
  for (const query of queries) {
    const match = fuzzyMatchAgentId(query, agentIds);
    if (!match) {
      console.warn(`[${context}] No agent found matching: "${query}"`);
    } else {
      matched.push(match);
    }
  }
  return matched;
}
