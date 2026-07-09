import { Module } from '@nestjs/common';
import { SpecParserService } from './spec-parser.service';
import { SpecValidatorService } from './spec-validator.service';
import { MockLlmSpecParser } from './mock-llm-spec-parser';
import {
  OpenAiCompatibleSpecParser,
  createFetchChatCompletion,
} from './openai-compatible-spec-parser';
import type { LlmSpecParser, SpecParserMode } from './llm-spec-parser';

function resolveMode(): SpecParserMode {
  const m = process.env.SPEC_PARSER_MODE ?? 'hybrid';
  return m === 'deterministic' || m === 'llm' || m === 'hybrid' ? m : 'hybrid';
}

/**
 * Resolve the LLM parser from env (§4). `mock` (default) needs no key and is
 * used by CI/E2E; `openai-compatible` reads SPEC_LLM_* and is always wired as
 * the real parser — if the gateway/key is missing or unreachable it fails at
 * parse time with a clear PROMPT_PARSE_FAILED ("LLM 不可用"), never a silent
 * mock fallback that produces wrong Specs (§3.2 fallback #3 / §13 test #1).
 */
function resolveLlmParser(): LlmSpecParser {
  const provider = process.env.SPEC_LLM_PROVIDER ?? 'mock';
  if (provider === 'openai-compatible') {
    const baseUrl = process.env.SPEC_LLM_BASE_URL ?? '';
    const apiKey = process.env.SPEC_LLM_API_KEY ?? '';
    const model = process.env.SPEC_LLM_MODEL ?? '';
    const timeoutSeconds = Number(process.env.SPEC_LLM_TIMEOUT_SECONDS ?? '45');
    const maxRetries = Number(process.env.SPEC_LLM_MAX_RETRIES ?? '2');
    const opts = { baseUrl, apiKey, model, timeoutSeconds, maxRetries };
    return new OpenAiCompatibleSpecParser(opts, createFetchChatCompletion(opts));
  }
  return new MockLlmSpecParser();
}

@Module({
  providers: [
    { provide: 'LLM_SPEC_PARSER', useFactory: resolveLlmParser },
    SpecValidatorService,
    {
      provide: SpecParserService,
      useFactory: (llm: LlmSpecParser) => new SpecParserService(llm, resolveMode()),
      inject: ['LLM_SPEC_PARSER'],
    },
  ],
  exports: [SpecParserService, SpecValidatorService],
})
export class SpecModule {}
