import { Injectable } from '@nestjs/common';
import { ZodError } from 'zod';
import {
  AgentBuilderError,
  ErrorCode,
  agentSpecSchema,
  workflowSpecSchema,
  type AgentSpec,
  type WorkflowSpec,
} from '@agent-builder/shared-contracts';

function isAgentSpec(spec: AgentSpec | WorkflowSpec): spec is AgentSpec {
  return 'tools' in spec && !('nodes' in spec);
}

/**
 * Spec validator (architecture §5.1 / Phase 2 §6.3).
 *
 * Re-runs the zod schema (so an LLM-produced Spec is still checked) and then
 * enforces the Workflow graph rules zod can't express: Start/End present,
 * edges reference existing nodes, ≥3 business nodes (PRD §7.3, FR-004).
 */
@Injectable()
export class SpecValidatorService {
  validate(spec: AgentSpec | WorkflowSpec): AgentSpec | WorkflowSpec {
    let parsed: AgentSpec | WorkflowSpec;
    try {
      parsed = isAgentSpec(spec)
        ? (agentSpecSchema.parse(spec) as AgentSpec)
        : (workflowSpecSchema.parse(spec) as WorkflowSpec);
    } catch (err) {
      if (err instanceof ZodError) {
        const issue = err.issues[0];
        const message = issue
          ? `${issue.path.join('.') || 'spec'}: ${issue.message}`
          : 'Spec 校验失败';
        throw new AgentBuilderError(ErrorCode.SpecValidationFailed, message);
      }
      throw err;
    }

    if (!isAgentSpec(parsed)) {
      this.validateWorkflowGraph(parsed);
    }
    return parsed;
  }

  private validateWorkflowGraph(spec: WorkflowSpec): void {
    const nodeIds = new Set(spec.nodes.map((n) => n.id));

    if (!spec.nodes.some((n) => n.type === 'start')) {
      throw new AgentBuilderError(
        ErrorCode.SpecValidationFailed,
        'Workflow Spec 缺少 Start 节点',
      );
    }
    if (!spec.nodes.some((n) => n.type === 'end')) {
      throw new AgentBuilderError(
        ErrorCode.SpecValidationFailed,
        'Workflow Spec 缺少 End 节点',
      );
    }

    for (const edge of spec.edges) {
      if (!nodeIds.has(edge.from)) {
        throw new AgentBuilderError(
          ErrorCode.SpecValidationFailed,
          `Workflow edge from 指向不存在的节点: ${edge.from}`,
        );
      }
      if (!nodeIds.has(edge.to)) {
        throw new AgentBuilderError(
          ErrorCode.SpecValidationFailed,
          `Workflow edge to 指向不存在的节点: ${edge.to}`,
        );
      }
    }

    // D-015: detect cycles using DFS.
    const adj = new Map<string, string[]>();
    for (const n of spec.nodes) adj.set(n.id, []);
    for (const e of spec.edges) adj.get(e.from)?.push(e.to);

    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const n of spec.nodes) color.set(n.id, WHITE);

    const hasCycle = (function dfs(nodeId: string): boolean {
      color.set(nodeId, GRAY);
      for (const next of adj.get(nodeId) ?? []) {
        const c = color.get(next) ?? WHITE;
        if (c === GRAY) return true;
        if (c === WHITE && dfs(next)) return true;
      }
      color.set(nodeId, BLACK);
      return false;
    })(
      spec.nodes.find((n) => n.type === 'start')?.id ??
        spec.nodes[0]?.id ??
        '',
    );

    // Also check any unreachable nodes for cycles.
    if (!hasCycle) {
      for (const n of spec.nodes) {
        if (color.get(n.id) === WHITE) {
          if ((function dfs2(id: string): boolean {
            color.set(id, GRAY);
            for (const next of adj.get(id) ?? []) {
              const c = color.get(next) ?? WHITE;
              if (c === GRAY) return true;
              if (c === WHITE && dfs2(next)) return true;
            }
            color.set(id, BLACK);
            return false;
          })(n.id)) {
            throw new AgentBuilderError(
              ErrorCode.SpecValidationFailed,
              'Workflow 包含循环边（cycle detected）',
            );
          }
        }
      }
    }

    if (hasCycle) {
      throw new AgentBuilderError(
        ErrorCode.SpecValidationFailed,
        'Workflow 包含循环边（cycle detected）',
      );
    }

    const businessNodes = spec.nodes.filter(
      (n) => n.type !== 'start' && n.type !== 'end',
    ).length;
    if (businessNodes < 3) {
      throw new AgentBuilderError(
        ErrorCode.SpecValidationFailed,
        `Workflow 至少需要 3 个业务节点，当前 ${businessNodes} 个`,
      );
    }
  }
}
