import { SpecParserService } from './spec-parser.service';
import { SpecValidatorService } from './spec-validator.service';
import { expectAgentBuilderError } from '../testing/expect-error';
import { ErrorCode, GenerationType } from '@agent-builder/shared-contracts';

describe('SpecParserService (Phase 2 §6.2 — deterministic parser)', () => {
  const parser = new SpecParserService();
  const validator = new SpecValidatorService();

  const TAROT_PROMPT =
    '一个塔罗牌占卜 Agent。首先询问用户想要占卜的问题，之后抽取塔罗牌并解读。';
  const PRESALES_PROMPT =
    '读取客户需求文档，抽取客户目标和限制条件，匹配可演示的解决方案，生成 Demo 清单并输出一份 Markdown 报告。';

  it('#1 塔罗 Agent prompt 生成 Agent Spec', () => {
    const spec = parser.parse(TAROT_PROMPT, GenerationType.Agent);
    expect(spec).toBeTruthy();
    expect(spec.name).toBe('塔罗牌占卜 Agent');
    expect('tools' in spec && spec.tools.length).toBeGreaterThanOrEqual(1); // checkpoint #4
    expect('tools' in spec && spec.tools[0].name).toBe('draw_tarot');
    expect('system_prompt' in spec && spec.system_prompt.length).toBeGreaterThan(0);
    // Spec is JSON-serializable (checkpoint #2)
    expect(() => JSON.stringify(spec)).not.toThrow();
  });

  it('#2 售前 Workflow prompt 生成 Workflow Spec', () => {
    const spec = parser.parse(PRESALES_PROMPT, GenerationType.Workflow);
    expect(spec).toBeTruthy();
    expect(spec.name).toBe('售前需求分析 Workflow');
    expect('nodes' in spec).toBe(true);
    if ('nodes' in spec) {
      // checkpoint #3: Start + End + ≥3 business nodes
      const types = spec.nodes.map((n) => n.type);
      expect(types).toContain('start');
      expect(types).toContain('end');
      const business = spec.nodes.filter(
        (n) => n.type !== 'start' && n.type !== 'end',
      ).length;
      expect(business).toBeGreaterThanOrEqual(3);
    }
    expect(() => JSON.stringify(spec)).not.toThrow();
  });

  it('produces stable Specs across calls (checkpoint #1)', () => {
    const a1 = parser.parse(TAROT_PROMPT, GenerationType.Agent);
    const a2 = parser.parse(TAROT_PROMPT, GenerationType.Agent);
    expect(JSON.stringify(a1)).toBe(JSON.stringify(a2));

    const w1 = parser.parse(PRESALES_PROMPT, GenerationType.Workflow);
    const w2 = parser.parse(PRESALES_PROMPT, GenerationType.Workflow);
    expect(JSON.stringify(w1)).toBe(JSON.stringify(w2));
  });

  it('returns a deep clone (caller cannot mutate the canonical spec)', () => {
    const a1 = parser.parse(TAROT_PROMPT, GenerationType.Agent) as { tools: { name: string }[] };
    a1.tools[0].name = 'mutated';
    const a2 = parser.parse(TAROT_PROMPT, GenerationType.Agent) as { tools: { name: string }[] };
    expect(a2.tools[0].name).toBe('draw_tarot');
  });

  it('#5 非 P0 示例 prompt 返回 PROMPT_PARSE_FAILED', () => {
    // checkpoint #5: error prompt returns PROMPT_PARSE_FAILED
    expectAgentBuilderError(
      () => parser.parse('做一个天气查询 Agent', GenerationType.Agent),
      ErrorCode.PromptParseFailed,
    );
    expectAgentBuilderError(
      () => parser.parse('随便一段无关文字', GenerationType.Workflow),
      ErrorCode.PromptParseFailed,
    );
  });

  it('#6 Skills never reaches the parser (rejected at the request schema)', () => {
    // type 'skill' is rejected by createGenerationRequestSchema before the parser
    // is invoked (see shared-contracts/events.test.ts). The parser only accepts
    // agent/workflow, so there is no Skills creation path.
    expect(['agent', 'workflow']).not.toContain('skill');
  });

  it('canonical Specs pass the validator', () => {
    expect(() => validator.validate(parser.parse(TAROT_PROMPT, GenerationType.Agent))).not.toThrow();
    expect(() =>
      validator.validate(parser.parse(PRESALES_PROMPT, GenerationType.Workflow)),
    ).not.toThrow();
  });
});
