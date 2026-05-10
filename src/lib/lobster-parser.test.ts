import { describe, it, expect } from "vitest";
import {
  parseLobsterYaml,
  lobsterToFlow,
  flowToLobster,
  serializeLobsterYaml,
} from "./lobster-parser";

const SIMPLE_WORKFLOW = `name: simple-test
description: Simple test workflow to verify lobster execution
steps:
  - id: test1
    command: 'echo "Step 1: Hello from Lobster"'
  - id: test2
    command: 'echo "Step 2: Workflow execution successful"'
  - id: test3
    command: date
`;

const DATA_FLOW_WORKFLOW = `name: data-flow-test
description: Tests stdin data flow between steps
steps:
  - id: generate
    command: echo "hello world"
  - id: transform
    command: tr 'a-z' 'A-Z'
    stdin: $generate.stdout
  - id: output
    command: cat
    stdin: $transform.stdout
`;

const APPROVAL_WORKFLOW = `name: approval-test
description: Tests approval and condition
steps:
  - id: prepare
    command: echo "preparing"
  - id: review
    command: echo "review needed"
    approval: true
  - id: deploy
    command: echo "deploying"
    condition: $review.approved
`;

const TOOL_WORKFLOW = `name: tool-test
steps:
  - id: invoke
    command: openclaw.invoke --tool web_search --query "test"
`;

describe("parseLobsterYaml", () => {
  it("parses a simple workflow", () => {
    const wf = parseLobsterYaml(SIMPLE_WORKFLOW);
    expect(wf.name).toBe("simple-test");
    expect(wf.description).toBe("Simple test workflow to verify lobster execution");
    expect(wf.steps).toHaveLength(3);
    expect(wf.steps[0].id).toBe("test1");
    expect(wf.steps[2].command).toBe("date");
  });

  it("parses workflow with stdin references", () => {
    const wf = parseLobsterYaml(DATA_FLOW_WORKFLOW);
    expect(wf.steps[1].stdin).toBe("$generate.stdout");
    expect(wf.steps[2].stdin).toBe("$transform.stdout");
  });

  it("parses workflow with approval and condition", () => {
    const wf = parseLobsterYaml(APPROVAL_WORKFLOW);
    expect(wf.steps[1].approval).toBe(true);
    expect(wf.steps[2].condition).toBe("$review.approved");
  });

  it("preserves unknown fields", () => {
    const yamlWithExtra = `name: extra
steps:
  - id: s1
    command: echo hi
    custom_field: custom_value
`;
    const wf = parseLobsterYaml(yamlWithExtra);
    expect((wf.steps[0] as Record<string, unknown>).custom_field).toBe("custom_value");
  });
});

describe("lobsterToFlow", () => {
  it("creates nodes for each step", () => {
    const wf = parseLobsterYaml(SIMPLE_WORKFLOW);
    const { nodes } = lobsterToFlow(wf);
    expect(nodes).toHaveLength(3);
    expect(nodes[0].type).toBe("shell-step");
    expect(nodes[0].id).toBe("test1");
  });

  it("creates sequential edges", () => {
    const wf = parseLobsterYaml(SIMPLE_WORKFLOW);
    const { edges } = lobsterToFlow(wf);
    const seqEdges = edges.filter((e) => e.data?.edgeKind === "sequence");
    expect(seqEdges).toHaveLength(2);
    expect(seqEdges[0].source).toBe("test1");
    expect(seqEdges[0].target).toBe("test2");
  });

  it("creates dataflow edges from stdin", () => {
    const wf = parseLobsterYaml(DATA_FLOW_WORKFLOW);
    const { edges } = lobsterToFlow(wf);
    const dataEdges = edges.filter((e) => e.data?.edgeKind === "dataflow");
    expect(dataEdges).toHaveLength(2);
    expect(dataEdges[0].source).toBe("generate");
    expect(dataEdges[0].target).toBe("transform");
  });

  it("creates condition edges", () => {
    const wf = parseLobsterYaml(APPROVAL_WORKFLOW);
    const { edges } = lobsterToFlow(wf);
    const condEdges = edges.filter((e) => e.data?.edgeKind === "condition");
    expect(condEdges).toHaveLength(1);
    expect(condEdges[0].source).toBe("review");
    expect(condEdges[0].target).toBe("deploy");
  });

  it("classifies tool step", () => {
    const wf = parseLobsterYaml(TOOL_WORKFLOW);
    const { nodes } = lobsterToFlow(wf);
    expect(nodes[0].type).toBe("tool-step");
    expect(nodes[0].data.toolName).toBe("web_search");
  });

  it("classifies approval step", () => {
    const wf = parseLobsterYaml(APPROVAL_WORKFLOW);
    const { nodes } = lobsterToFlow(wf);
    expect(nodes[1].type).toBe("approval-step");
  });
});

describe("flowToLobster", () => {
  it("round-trips simple workflow steps in order", () => {
    const wf = parseLobsterYaml(SIMPLE_WORKFLOW);
    const { nodes, edges } = lobsterToFlow(wf);
    const rebuilt = flowToLobster(nodes, edges, { name: wf.name, description: wf.description });
    expect(rebuilt.steps).toHaveLength(3);
    expect(rebuilt.steps[0].id).toBe("test1");
    expect(rebuilt.steps[1].id).toBe("test2");
    expect(rebuilt.steps[2].id).toBe("test3");
  });

  it("preserves data flow stdin references via edges", () => {
    const wf = parseLobsterYaml(DATA_FLOW_WORKFLOW);
    const { nodes, edges } = lobsterToFlow(wf);
    const rebuilt = flowToLobster(nodes, edges, { name: wf.name });
    expect(rebuilt.steps[1].stdin).toBe("$generate.stdout");
    expect(rebuilt.steps[2].stdin).toBe("$transform.stdout");
  });

  it("preserves condition references via edges", () => {
    const wf = parseLobsterYaml(APPROVAL_WORKFLOW);
    const { nodes, edges } = lobsterToFlow(wf);
    const rebuilt = flowToLobster(nodes, edges, { name: wf.name });
    expect(rebuilt.steps[2].condition).toBe("$review.approved");
  });

  it("sorts nodes by y position", () => {
    const wf = parseLobsterYaml(SIMPLE_WORKFLOW);
    const { nodes, edges } = lobsterToFlow(wf);
    // Reverse Y positions
    const reversed = nodes.map((n, i) => ({
      ...n,
      position: { ...n.position, y: (nodes.length - i) * 120 },
    }));
    const rebuilt = flowToLobster(reversed, edges, {});
    expect(rebuilt.steps[0].id).toBe("test3");
    expect(rebuilt.steps[2].id).toBe("test1");
  });
});

describe("serializeLobsterYaml", () => {
  it("serializes and re-parses", () => {
    const wf = parseLobsterYaml(SIMPLE_WORKFLOW);
    const yaml = serializeLobsterYaml(wf);
    const reparsed = parseLobsterYaml(yaml);
    expect(reparsed.name).toBe("simple-test");
    expect(reparsed.steps).toHaveLength(3);
  });

  it("round-trips the full pipeline", () => {
    const original = parseLobsterYaml(DATA_FLOW_WORKFLOW);
    const { nodes, edges } = lobsterToFlow(original);
    const rebuilt = flowToLobster(nodes, edges, {
      name: original.name,
      description: original.description,
    });
    const yaml = serializeLobsterYaml(rebuilt);
    const reparsed = parseLobsterYaml(yaml);
    expect(reparsed.name).toBe("data-flow-test");
    expect(reparsed.steps).toHaveLength(3);
    expect(reparsed.steps[1].stdin).toBe("$generate.stdout");
  });
});
