import { SpecParserService } from './spec-parser.service';
import { TestSpecParser } from '../testing/test-spec-parser';
import { SpecValidatorService } from './spec-validator.service';
import { GenerationType } from '@agent-builder/shared-contracts';

describe('SpecParserService (always LLM — no deterministic demo bypass)', () => {
  const validator = new SpecValidatorService();
  const llm = new TestSpecParser();

  const TAROT_PROMPT =
    '一个塔罗牌占卜 Agent。首先询问用户想要占卜的问题，之后抽取塔罗牌并解读。';
  const CUSTOM_AGENT_PROMPT = '做一个天气查询 Agent，用户输入城市名，返回天气信息。';
  const CUSTOM_WORKFLOW_PROMPT = '合同审核流程：输入合同文本 -> 分析 -> 生成报告。';

  describe('all prompts go through the LLM parser', () => {
    const parser = new SpecParserService(llm);

    it('tarot demo prompt also goes through LLM (test parser -> generic spec)', async () => {
      const { spec, provider, parserMode } = await parser.parse(TAROT_PROMPT, GenerationType.Agent);
      // Test parser returns generic spec, not the tarot demo
      expect(spec.name).toBe('通用智能体');
      expect(provider).toBe('test');
      expect(parserMode).toBe('llm');
      expect(() => validator.validate(spec)).not.toThrow();
    });

    it('custom agent prompt goes through LLM', async () => {
      const { spec, provider, parserMode } = await parser.parse(CUSTOM_AGENT_PROMPT, GenerationType.Agent);
      expect(spec.name).toBe('通用智能体');
      expect(provider).toBe('test');
      expect(parserMode).toBe('llm');
      expect(() => validator.validate(spec)).not.toThrow();
    });

    it('custom workflow prompt goes through LLM', async () => {
      const { spec, provider } = await parser.parse(CUSTOM_WORKFLOW_PROMPT, GenerationType.Workflow);
      expect(spec.name).toBe('通用处理工作流');
      expect(provider).toBe('test');
      expect(() => validator.validate(spec)).not.toThrow();
    });

    it('presales-like prompt also goes through LLM (no keyword match)', async () => {
      const { spec, provider } = await parser.parse(
        '读取客户需求文档，抽取目标并匹配方案，输出报告。',
        GenerationType.Workflow,
      );
      // Test parser returns generic, NOT the presales demo
      expect(spec.name).toBe('通用处理工作流');
      expect(provider).toBe('test');
      expect(() => validator.validate(spec)).not.toThrow();
    });

    it('produces consistent results for the same input', async () => {
      const a1 = (await parser.parse(CUSTOM_AGENT_PROMPT, GenerationType.Agent)).spec;
      const a2 = (await parser.parse(CUSTOM_AGENT_PROMPT, GenerationType.Agent)).spec;
      expect(JSON.stringify(a1)).toBe(JSON.stringify(a2));
    });
  });
});
