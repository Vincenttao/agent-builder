import { MockLlmSpecParser } from './mock-llm-spec-parser';
import { SpecValidatorService } from './spec-validator.service';
import { GenerationType, type AgentSpec, type WorkflowSpec } from '@agent-builder/shared-contracts';

describe('MockLlmSpecParser (Phase 9 §5 — LLM parser mock provider)', () => {
  const parser = new MockLlmSpecParser();
  const validator = new SpecValidatorService();

  it('#1 returns a valid AgentSpec for a non-example agent prompt', async () => {
    const spec = (await parser.parse('做一个天气查询 Agent', GenerationType.Agent)) as AgentSpec;
    expect(spec).toBeTruthy();
    // Must pass the same schema validation real LLM output goes through.
    expect(() => validator.validate(spec)).not.toThrow();
    expect(spec.tools.length).toBeGreaterThanOrEqual(1);
  });

  it('#2 the parsed AgentSpec is not the tarot demo spec', async () => {
    const spec = (await parser.parse('天气查询', GenerationType.Agent)) as AgentSpec;
    expect(spec.name).not.toContain('塔罗');
    expect(spec.tools.map((t) => t.name)).not.toContain('draw_tarot');
    expect(JSON.stringify(spec)).not.toContain('占卜');
  });

  it('#3 returns a valid WorkflowSpec for a non-example workflow prompt', async () => {
    const spec = (await parser.parse('合同审核流程', GenerationType.Workflow)) as WorkflowSpec;
    expect(spec).toBeTruthy();
    expect(() => validator.validate(spec)).not.toThrow();
    expect('nodes' in spec).toBe(true);
  });

  it('#4 the parsed WorkflowSpec is not the presales demo spec', async () => {
    const spec = (await parser.parse('合同审核', GenerationType.Workflow)) as WorkflowSpec;
    expect(spec.name).not.toContain('售前');
    expect(JSON.stringify(spec)).not.toContain('Demo 清单');
    expect(JSON.stringify(spec)).not.toContain('需求抽取');
  });
});
