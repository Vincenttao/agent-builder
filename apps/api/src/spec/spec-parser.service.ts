import { Injectable } from '@nestjs/common';
import {
  AgentBuilderError,
  ErrorCode,
  GenerationType,
  type AgentSpec,
  type WorkflowSpec,
} from '@agent-builder/shared-contracts';
import { TAROT_AGENT_SPEC, PRESALES_WORKFLOW_SPEC } from './canonical-specs';
import type { LlmSpecParser, SpecParserMode, ParseResult } from './llm-spec-parser';

/**
 * Spec parser (Phase 9 §5 — async, mode-driven).
 *
 * Modes (SPEC_PARSER_MODE):
 *  - deterministic: keyword-match the two PRD demo prompts only. Non-example
 *    prompts fail fast (no LLM). Kept as the stable demo fallback (§3.2 #1/#2).
 *  - llm: always go through the LLM parser.
 *  - hybrid (default): demo prompts use the deterministic path; everything else
 *    uses the LLM parser. This unblocks PROMPT_PARSE_FAILED for real users.
 *
 * Single async entry — no sync/parseAsync split (plan §9 note 12). The LLM
 * parser returns a raw object; the caller still runs SpecValidatorService
 * (§3.3.1/§3.3.2 — LLM output never bypasses schema validation).
 */
@Injectable()
export class SpecParserService {
  constructor(
    private readonly llmParser: LlmSpecParser,
    private readonly mode: SpecParserMode,
  ) {}

  async parse(prompt: string, type: GenerationType): Promise<ParseResult> {
    if (this.mode === 'deterministic' || (this.mode === 'hybrid' && this.matchesDemo(prompt, type))) {
      const spec = this.parseDeterministic(prompt, type);
      return { spec, parserMode: this.mode, provider: 'deterministic', model: null };
    }
    const spec = await this.llmParser.parse(prompt, type);
    return {
      spec,
      parserMode: this.mode,
      provider: this.llmParser.provider,
      model: this.llmParser.model,
    };
  }

  private matchesDemo(prompt: string, type: GenerationType): boolean {
    if (type === GenerationType.Agent) return prompt.includes('塔罗');
    return this.matchesPresalesDemo(prompt);
  }

  private parseDeterministic(prompt: string, type: GenerationType): AgentSpec | WorkflowSpec {
    if (type === GenerationType.Agent) {
      if (prompt.includes('塔罗')) return structuredClone(TAROT_AGENT_SPEC);
      throw new AgentBuilderError(
        ErrorCode.PromptParseFailed,
        'deterministic 模式仅支持内置示例 prompt；请切换到 hybrid 或 llm 模式以使用 LLM 解析。',
      );
    }
    if (this.matchesPresalesDemo(prompt)) {
      return structuredClone(PRESALES_WORKFLOW_SPEC);
    }
    throw new AgentBuilderError(
      ErrorCode.PromptParseFailed,
      'deterministic 模式仅支持内置示例 prompt；请切换到 hybrid 或 llm 模式以使用 LLM 解析。',
    );
  }

  private matchesPresalesDemo(prompt: string): boolean {
    const normalized = prompt.toLowerCase();
    const requiredSignals = ['客户', '需求', 'demo', '报告'];
    return requiredSignals.every((k) => normalized.includes(k));
  }
}
