import { Module } from '@nestjs/common';
import { SpecParserService } from './spec-parser.service';
import { SpecValidatorService } from './spec-validator.service';
import {
  OpenAiCompatibleSpecParser,
  createFetchChatCompletion,
} from './openai-compatible-spec-parser';
import type { LlmSpecParser } from './llm-spec-parser';

/**
 * Resolve the LLM parser from env. `mock` (default) needs no key and is
 * used by CI/E2E; `openai-compatible` reads SPEC_LLM_* for real LLM parsing.
 * Every prompt always goes through the LLM parser — there is no longer a
 * deterministic keyword-match bypass for demo prompts.
 */
function resolveLlmParser(): LlmSpecParser {
  const provider = process.env.SPEC_LLM_PROVIDER ?? 'openai-compatible';
  if (provider === 'openai-compatible') {
    const baseUrl = process.env.SPEC_LLM_BASE_URL ?? '';
    const apiKey = process.env.SPEC_LLM_API_KEY ?? '';
    const model = process.env.SPEC_LLM_MODEL ?? '';
    const timeoutSeconds = Number(process.env.SPEC_LLM_TIMEOUT_SECONDS ?? '45');
    const maxRetries = Number(process.env.SPEC_LLM_MAX_RETRIES ?? '2');
    const opts = { baseUrl, apiKey, model, timeoutSeconds, maxRetries };
    return new OpenAiCompatibleSpecParser(opts, createFetchChatCompletion(opts));
  }
  throw new Error(`Unsupported SPEC_LLM_PROVIDER: ${provider}`);
}

@Module({
  providers: [
    { provide: 'LLM_SPEC_PARSER', useFactory: resolveLlmParser },
    SpecValidatorService,
    {
      provide: SpecParserService,
      useFactory: (llm: LlmSpecParser) => new SpecParserService(llm),
      inject: ['LLM_SPEC_PARSER'],
    },
  ],
  exports: [SpecParserService, SpecValidatorService],
})
export class SpecModule {}
