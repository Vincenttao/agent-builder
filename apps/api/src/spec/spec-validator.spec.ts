import { SpecValidatorService } from './spec-validator.service';
import { expectAgentBuilderError } from '../testing/expect-error';
import {
  AgentBuilderError,
  ErrorCode,
  type AgentSpec,
  type WorkflowSpec,
} from '@agent-builder/shared-contracts';
import { TAROT_AGENT_SPEC, PRESALES_WORKFLOW_SPEC } from './canonical-specs';

function clone<T>(x: T): T {
  return structuredClone(x);
}

describe('SpecValidatorService (Phase 2 §6.2 — validator)', () => {
  const validator = new SpecValidatorService();

  it('accepts the canonical Agent Spec', () => {
    expect(() => validator.validate(clone(TAROT_AGENT_SPEC))).not.toThrow();
  });

  it('accepts the canonical Workflow Spec', () => {
    expect(() => validator.validate(clone(PRESALES_WORKFLOW_SPEC))).not.toThrow();
  });

  it('#3 Agent Spec 缺少 name 时校验失败 (SPEC_VALIDATION_FAILED)', () => {
    const bad = clone(TAROT_AGENT_SPEC) as Partial<AgentSpec>;
    delete bad.name;
    expectAgentBuilderError(() => validator.validate(bad as AgentSpec), ErrorCode.SpecValidationFailed);
  });

  it('Agent Spec 没有工具时校验失败', () => {
    const bad = clone(TAROT_AGENT_SPEC);
    (bad as { tools: unknown[] }).tools = [];
    expectAgentBuilderError(() => validator.validate(bad as AgentSpec), ErrorCode.SpecValidationFailed);
  });

  it('#4 Workflow Spec 缺少 Start 时校验失败', () => {
    const bad = clone(PRESALES_WORKFLOW_SPEC) as WorkflowSpec;
    bad.nodes = bad.nodes.filter((n) => n.type !== 'start');
    const err = expectAgentBuilderError(() => validator.validate(bad), ErrorCode.SpecValidationFailed);
    expect(err.message).toMatch(/Start/);
  });

  it('Workflow Spec 缺少 End 时校验失败', () => {
    const bad = clone(PRESALES_WORKFLOW_SPEC) as WorkflowSpec;
    bad.nodes = bad.nodes.filter((n) => n.type !== 'end');
    const err = expectAgentBuilderError(() => validator.validate(bad), ErrorCode.SpecValidationFailed);
    expect(err.message).toMatch(/End/);
  });

  it('#5 Workflow edge 指向不存在节点时校验失败', () => {
    const bad = clone(PRESALES_WORKFLOW_SPEC) as WorkflowSpec;
    bad.edges = [{ from: 'start', to: 'nonexistent_node', condition: null }];
    const err = expectAgentBuilderError(() => validator.validate(bad), ErrorCode.SpecValidationFailed);
    expect(err.message).toMatch(/nonexistent_node/);
  });

  it('Workflow 少于 3 个业务节点时校验失败', () => {
    const bad = clone(PRESALES_WORKFLOW_SPEC) as WorkflowSpec;
    // keep only start, one business, end → 1 business node
    const keep = new Set(['start', 'extract_requirement', 'end']);
    bad.nodes = bad.nodes.filter((n) => keep.has(n.id));
    bad.edges = bad.edges.filter((e) => keep.has(e.from) && keep.has(e.to));
    const err = expectAgentBuilderError(() => validator.validate(bad), ErrorCode.SpecValidationFailed);
    expect(err.message).toMatch(/业务节点/);
  });

  it('error messages are user-understandable (PRD FR-012)', () => {
    const bad = clone(PRESALES_WORKFLOW_SPEC) as WorkflowSpec;
    bad.nodes = bad.nodes.filter((n) => n.type !== 'start');
    let caught: AgentBuilderError | null = null;
    try {
      validator.validate(bad);
    } catch (e) {
      caught = e as AgentBuilderError;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/Start/);
    expect(caught!.toResponse().error_code).toBe(ErrorCode.SpecValidationFailed);
  });
});
