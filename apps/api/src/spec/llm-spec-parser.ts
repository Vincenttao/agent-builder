import type { AgentSpec, WorkflowSpec, GenerationType } from '@agent-builder/shared-contracts';

/**
 * LLM-backed spec parser.
 *
 * Implementations turn a natural-language prompt into a raw (unvalidated)
 * AgentSpec / WorkflowSpec JSON object. The caller (SpecParserService) is
 * responsible for running the result through SpecValidatorService — an LLM
 * never bypasses schema validation (security boundary).
 *
 * Every prompt always routes through the LLM parser — there is no longer a
 * deterministic keyword-match bypass for demo prompts.
 */
export interface LlmSpecParser {
  /** Stable provider id, persisted on generation_specs for observability. */
  readonly provider: 'test' | 'openai-compatible';
  /** Model name used. */
  readonly model: string | null;
  parse(prompt: string, type: GenerationType): Promise<AgentSpec | WorkflowSpec>;
}

/**
 * Result of SpecParserService.parse — carries the validated-elsewhere spec plus
 * the metadata persisted on generation_specs (parser_mode / provider / model)
 * so the orchestrator can store and later surface how a spec was produced.
 */
export interface ParseResult {
  spec: AgentSpec | WorkflowSpec;
  /** Always 'llm' — all prompts go through the LLM parser. */
  parserMode: 'llm';
  /** What actually produced this spec: 'mock' | 'openai-compatible'. */
  provider: string;
  model: string | null;
}
