import { SpecParserService } from './spec-parser.service';
import { MockLlmSpecParser } from './mock-llm-spec-parser';
import { SpecValidatorService } from './spec-validator.service';
import { expectAgentBuilderErrorAsync } from '../testing/expect-error';
import { ErrorCode, GenerationType } from '@agent-builder/shared-contracts';

describe('SpecParserService (Phase 9 — async hybrid parser)', () => {
  const validator = new SpecValidatorService();
  const llm = new MockLlmSpecParser();

  const TAROT_PROMPT =
    '一个塔罗牌占卜 Agent。首先询问用户想要占卜的问题，之后抽取塔罗牌并解读。';
  const PRESALES_PROMPT =
    '读取客户需求文档，抽取客户目标和限制条件，匹配可演示的解决方案，生成 Demo 清单并输出一份 Markdown 报告。';

  describe('deterministic mode (P0 demo regression — §3.2 fallback #1/#2)', () => {
    const parser = new SpecParserService(llm, 'deterministic');

    it('塔罗 Agent prompt → tarot spec', async () => {
      const { spec } = await parser.parse(TAROT_PROMPT, GenerationType.Agent);
      expect(spec.name).toBe('塔罗牌占卜 Agent');
      expect(() => validator.validate(spec)).not.toThrow();
    });

    it('售前 Workflow prompt → presales spec', async () => {
      const { spec } = await parser.parse(PRESALES_PROMPT, GenerationType.Workflow);
      expect(spec.name).toBe('售前需求分析 Workflow');
      expect(() => validator.validate(spec)).not.toThrow();
    });

    it('produces stable deep-cloned specs across calls', async () => {
      const a1 = (await parser.parse(TAROT_PROMPT, GenerationType.Agent)).spec;
      const a2 = (await parser.parse(TAROT_PROMPT, GenerationType.Agent)).spec;
      expect(JSON.stringify(a1)).toBe(JSON.stringify(a2));
      (a1 as { tools: { name: string }[] }).tools[0].name = 'mutated';
      const a3 = (await parser.parse(TAROT_PROMPT, GenerationType.Agent)).spec;
      expect((a3 as { tools: { name: string }[] }).tools[0].name).toBe('draw_tarot');
    });

    it('non-example prompt → PROMPT_PARSE_FAILED (without P0 demo-limitation copy)', async () => {
      const err = await expectAgentBuilderErrorAsync(
        () => parser.parse('做一个天气查询 Agent', GenerationType.Agent),
        ErrorCode.PromptParseFailed,
      );
      expect(err.message).not.toContain('P0 deterministic parser 暂仅支持');
    });
  });

  describe('hybrid mode (§7 minimum slice — unblocks non-example prompts)', () => {
    const parser = new SpecParserService(llm, 'hybrid');

    it('demo prompt still uses the deterministic path (tarot)', async () => {
      const { spec, provider } = await parser.parse(TAROT_PROMPT, GenerationType.Agent);
      expect(spec.name).toBe('塔罗牌占卜 Agent');
      expect(provider).toBe('deterministic');
    });

    it('non-example agent prompt goes through the LLM (mock → non-tarot spec)', async () => {
      const { spec, provider } = await parser.parse('做一个天气查询 Agent', GenerationType.Agent);
      expect(spec.name).not.toBe('塔罗牌占卜 Agent');
      expect(() => validator.validate(spec)).not.toThrow();
      expect((spec as { tools: { name: string }[] }).tools[0].name).toBe('query_info');
      expect(provider).toBe('mock');
    });

    it('non-example workflow prompt goes through the LLM (mock → non-presales spec)', async () => {
      const { spec } = await parser.parse('合同审核流程', GenerationType.Workflow);
      expect(spec.name).not.toBe('售前需求分析 Workflow');
      expect(() => validator.validate(spec)).not.toThrow();
      expect('nodes' in spec).toBe(true);
    });

    it('workflow prompts containing generic words like 报告/需求 still go through LLM unless they match the presales demo', async () => {
      const { spec, provider } = await parser.parse('生成日报报告 Workflow，汇总团队进展和风险', GenerationType.Workflow);
      expect(spec.name).not.toBe('售前需求分析 Workflow');
      expect(provider).toBe('mock');
      expect(() => validator.validate(spec)).not.toThrow();
    });
  });

  describe('llm mode', () => {
    const parser = new SpecParserService(llm, 'llm');

    it('even a demo prompt goes through the LLM parser', async () => {
      const { spec, provider } = await parser.parse(TAROT_PROMPT, GenerationType.Agent);
      expect(spec.name).toBe('通用智能体');
      expect(provider).toBe('mock');
    });
  });
});
