import { OpenAiCompatibleSpecParser, type ChatCompletionFn, type OpenAiCompatibleOptions } from './openai-compatible-spec-parser';
import { expectAgentBuilderErrorAsync } from '../testing/expect-error';
import { ErrorCode, GenerationType, type AgentSpec } from '@agent-builder/shared-contracts';

const VALID_AGENT_SPEC = {
  agent_id: 'a',
  name: '通用智能体',
  description: 'd',
  scenario: 's',
  openjiuwen_agent_type: 'react_agent',
  system_prompt: 'p',
  model: { provider: 'openjiuwen', model_name: 'default', temperature: 0.7 },
  tools: [{ name: 'query_info', description: 'd', input_schema: {}, output_schema: {} }],
  memory: { enabled: true, type: 'short_term' },
  examples: [],
  acceptance_checks: [],
};

const baseOpts: OpenAiCompatibleOptions = {
  baseUrl: 'https://example.invalid/v1',
  apiKey: 'sk-test',
  model: 'qwen-plus',
  timeoutSeconds: 30,
  maxRetries: 0,
};

describe('OpenAiCompatibleSpecParser (Phase 9 §5.3 — real provider, injectable transport)', () => {
  it('parses fenced JSON from the chat completion into a spec', async () => {
    const fn: ChatCompletionFn = async () => '```json\n' + JSON.stringify(VALID_AGENT_SPEC) + '\n```';
    const parser = new OpenAiCompatibleSpecParser(baseOpts, fn);
    const spec = (await parser.parse('天气查询', GenerationType.Agent)) as AgentSpec;
    expect(spec.name).toBe('通用智能体');
    expect(spec.tools[0].name).toBe('query_info');
  });

  it('throws PROMPT_PARSE_FAILED (LLM 不可用) when the call rejects, after retries', async () => {
    const fn: ChatCompletionFn = async () => {
      throw new Error('network down');
    };
    const parser = new OpenAiCompatibleSpecParser({ ...baseOpts, maxRetries: 2 }, fn);
    const err = await expectAgentBuilderErrorAsync(
      () => parser.parse('天气', GenerationType.Agent),
      ErrorCode.PromptParseFailed,
    );
    expect(err.message).toContain('不可用');
  });

  it('throws PROMPT_PARSE_FAILED (无法解析) when the model returns non-JSON', async () => {
    const fn: ChatCompletionFn = async () => 'sorry, I cannot help with that';
    const parser = new OpenAiCompatibleSpecParser({ ...baseOpts, maxRetries: 1 }, fn);
    const err = await expectAgentBuilderErrorAsync(
      () => parser.parse('天气', GenerationType.Agent),
      ErrorCode.PromptParseFailed,
    );
    expect(err.message).toContain('JSON');
  });

  it('retries on a transient failure then succeeds', async () => {
    let calls = 0;
    const fn: ChatCompletionFn = async () => {
      calls++;
      if (calls === 1) throw new Error('transient');
      return '```json\n' + JSON.stringify(VALID_AGENT_SPEC) + '\n```';
    };
    const parser = new OpenAiCompatibleSpecParser({ ...baseOpts, maxRetries: 2 }, fn);
    const spec = (await parser.parse('天气', GenerationType.Agent)) as AgentSpec;
    expect(spec.name).toBe('通用智能体');
    expect(calls).toBe(2);
  });
});
