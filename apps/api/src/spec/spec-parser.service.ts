import { Injectable } from '@nestjs/common';
import { GenerationType } from '@agent-builder/shared-contracts';
import type { LlmSpecParser, ParseResult } from './llm-spec-parser';

/**
 * Spec parser — always routes through the LLM (or mock) parser.
 *
 * The SPEC_PARSER_MODE env var is accepted for backward compatibility but no
 * longer gates a deterministic keyword-match path. Every prompt, including the
 * original demo prompts (tarot / presales), goes through the configured LLM
 * provider so the system behaves uniformly.
 */
@Injectable()
export class SpecParserService {
  constructor(private readonly llmParser: LlmSpecParser) {}

  async parse(prompt: string, type: GenerationType): Promise<ParseResult> {
    const spec = await this.llmParser.parse(prompt, type);
    return {
      spec,
      parserMode: 'llm',
      provider: this.llmParser.provider,
      model: this.llmParser.model,
    };
  }
}
