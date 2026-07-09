import { extractSpecJson } from './json-extract';
import { expectAgentBuilderError } from '../testing/expect-error';
import { ErrorCode } from '@agent-builder/shared-contracts';

describe('extractSpecJson (Phase 9 §5.5 / test #8 — robust JSON extraction)', () => {
  const SPEC = { name: '通用智能体', tools: [{ name: 'query_info' }] };

  it('parses a plain JSON object', () => {
    expect(extractSpecJson(JSON.stringify(SPEC))).toEqual(SPEC);
  });

  it('parses JSON wrapped in a ```json fence', () => {
    const text = '```json\n' + JSON.stringify(SPEC, null, 2) + '\n```';
    expect(extractSpecJson(text)).toEqual(SPEC);
  });

  it('parses JSON wrapped in a bare ``` fence', () => {
    const text = '```\n' + JSON.stringify(SPEC) + '\n```';
    expect(extractSpecJson(text)).toEqual(SPEC);
  });

  it('parses JSON embedded in surrounding prose', () => {
    const text = 'Here is the spec:\n' + JSON.stringify(SPEC) + '\nHope this helps.';
    expect(extractSpecJson(text)).toEqual(SPEC);
  });

  it('throws PROMPT_PARSE_FAILED when no JSON object is present', () => {
    expectAgentBuilderError(() => extractSpecJson('no json here at all'), ErrorCode.PromptParseFailed);
  });

  it('throws PROMPT_PARSE_FAILED on malformed JSON', () => {
    expectAgentBuilderError(() => extractSpecJson('{ name: "x", broken }'), ErrorCode.PromptParseFailed);
  });
});
