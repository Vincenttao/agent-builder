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
