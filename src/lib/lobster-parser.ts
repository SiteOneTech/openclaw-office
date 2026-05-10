/**
 * Lobster workflow YAML parser and React Flow converter.
 *
 * Parses a subset of YAML used by OpenClaw Lobster workflow definitions
 * and converts between the YAML representation and React Flow node/edge graphs.
 */

export interface LobsterStep {
  id: string;
  command: string;
  stdin?: string;
  approval?: boolean;
  condition?: string;
  [key: string]: unknown;
}

export interface LobsterWorkflow {
  name: string;
  description?: string;
  steps: LobsterStep[];
  [key: string]: unknown;
}

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  data?: Record<string, unknown>;
}

// ── YAML subset parser (no external dep) ─────────────────────────

export function parseLobsterYaml(yaml: string): LobsterWorkflow {
  const lines = yaml.split("\n");
  const workflow: Record<string, unknown> = {};
  const steps: LobsterStep[] = [];
  let currentStep: Record<string, unknown> | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    const topMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (topMatch) {
      flushStep(currentStep, steps);
      currentStep = null;
      const [, key, val] = topMatch;
      if (key === "steps") continue;
      workflow[key] = parseScalar(val);
      continue;
    }

    const listMatch = line.match(/^\s{2}- /);
    if (listMatch) {
      flushStep(currentStep, steps);
      currentStep = {};
      const rest = line.replace(/^\s{2}- /, "");
      const kv = rest.match(/^(\w[\w_]*):\s*(.+)$/);
      if (kv) {
        currentStep[kv[1]] = parseScalar(kv[2]);
      }
      continue;
    }

    const propMatch = line.match(/^\s{4}(\w[\w_]*):\s*(.+)$/);
    if (propMatch && currentStep) {
      currentStep[propMatch[1]] = parseScalar(propMatch[2]);
    }
  }

  flushStep(currentStep, steps);

  return {
    name: String(workflow.name ?? ""),
    description: workflow.description != null ? String(workflow.description) : undefined,
    steps,
    ...Object.fromEntries(
      Object.entries(workflow).filter(([k]) => k !== "name" && k !== "description"),
    ),
  };
}

function flushStep(step: Record<string, unknown> | null, steps: LobsterStep[]) {
  if (!step || !step.id) return;
  steps.push(step as unknown as LobsterStep);
}

function parseScalar(raw: string): unknown {
  const v = raw.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null" || v === "~") return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d+\.\d+$/.test(v)) return Number(v);
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    return v.slice(1, -1);
  }
  return v;
}

// ── Flow conversion ──────────────────────────────────────────────

const NODE_Y_GAP = 120;

function classifyStep(step: LobsterStep): { type: string; toolName?: string } {
  if (step.approval) return { type: "approval-step" };
  const toolMatch = step.command.match(/openclaw\.invoke\s+--tool\s+(\S+)/);
  if (toolMatch) return { type: "tool-step", toolName: toolMatch[1] };
  return { type: "shell-step" };
}

export function lobsterToFlow(wf: LobsterWorkflow): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  wf.steps.forEach((step, idx) => {
    const { type, toolName } = classifyStep(step);
    nodes.push({
      id: step.id,
      type,
      position: { x: 0, y: idx * NODE_Y_GAP },
      data: { ...step, toolName },
    });

    if (idx > 0) {
      edges.push({
        id: `seq-${wf.steps[idx - 1].id}-${step.id}`,
        source: wf.steps[idx - 1].id,
        target: step.id,
        data: { edgeKind: "sequence" },
      });
    }

    if (step.stdin) {
      const srcMatch = step.stdin.match(/^\$(\w+)\./);
      if (srcMatch) {
        edges.push({
          id: `data-${srcMatch[1]}-${step.id}`,
          source: srcMatch[1],
          target: step.id,
          data: { edgeKind: "dataflow", stdinRef: step.stdin },
        });
      }
    }

    if (step.condition) {
      const condMatch = step.condition.match(/^\$(\w+)\./);
      if (condMatch) {
        edges.push({
          id: `cond-${condMatch[1]}-${step.id}`,
          source: condMatch[1],
          target: step.id,
          data: { edgeKind: "condition", conditionRef: step.condition },
        });
      }
    }
  });

  return { nodes, edges };
}

export function flowToLobster(
  nodes: FlowNode[],
  edges: FlowEdge[],
  meta: { name?: string; description?: string },
): LobsterWorkflow {
  const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);

  const dataEdgeMap = new Map<string, string>();
  const condEdgeMap = new Map<string, string>();
  for (const edge of edges) {
    if (edge.data?.edgeKind === "dataflow" && edge.data.stdinRef) {
      dataEdgeMap.set(edge.target, String(edge.data.stdinRef));
    }
    if (edge.data?.edgeKind === "condition" && edge.data.conditionRef) {
      condEdgeMap.set(edge.target, String(edge.data.conditionRef));
    }
  }

  const steps: LobsterStep[] = sorted.map((node) => {
    const step: LobsterStep = {
      id: node.id,
      command: String(node.data.command ?? ""),
    };
    const stdin = dataEdgeMap.get(node.id);
    if (stdin) step.stdin = stdin;
    if (node.data.approval) step.approval = true;
    const cond = condEdgeMap.get(node.id);
    if (cond) step.condition = cond;
    return step;
  });

  return {
    name: meta.name ?? "",
    ...(meta.description ? { description: meta.description } : {}),
    steps,
  };
}

// ── YAML serializer ──────────────────────────────────────────────

export function serializeLobsterYaml(wf: LobsterWorkflow): string {
  const lines: string[] = [];
  lines.push(`name: ${wf.name}`);
  if (wf.description) lines.push(`description: ${wf.description}`);
  lines.push("steps:");
  for (const step of wf.steps) {
    lines.push(`  - id: ${step.id}`);
    lines.push(`    command: ${serializeScalar(step.command)}`);
    if (step.stdin) lines.push(`    stdin: ${step.stdin}`);
    if (step.approval) lines.push(`    approval: true`);
    if (step.condition) lines.push(`    condition: ${step.condition}`);
  }
  return lines.join("\n") + "\n";
}

function serializeScalar(val: unknown): string {
  if (typeof val === "string") {
    if (val.includes('"') || val.includes("'") || val.includes(":")) {
      return `'${val.replace(/'/g, "''")}'`;
    }
    return val;
  }
  return String(val);
}
