import type { AgentSpec, WorkflowSpec, GenerationType } from '@agent-builder/shared-contracts';

/**
 * LLM-backed spec parser (Phase 9 §5).
 *
 * Implementations turn a natural-language prompt into a raw (unvalidated)
 * AgentSpec / WorkflowSpec JSON object. The caller (SpecParserService) is
 * responsible for running the result through SpecValidatorService — an LLM
 * never bypasses schema validation (security boundary §3.3.1/§3.3.2).
 */
export interface LlmSpecParser {
  /** Stable provider id, persisted on generation_specs for observability. */
  readonly provider: 'mock' | 'openai-compatible';
  /** Model name used (null for the mock provider / deterministic path). */
  readonly model: string | null;
  parse(prompt: string, type: GenerationType): Promise<AgentSpec | WorkflowSpec>;
}

export type SpecParserMode = 'deterministic' | 'llm' | 'hybrid';

/**
 * Result of SpecParserService.parse — carries the validated-elsewhere spec plus
 * the metadata persisted on generation_specs (parser_mode / provider / model)
 * so the orchestrator can store and later surface how a spec was produced
 * (Phase 12 §1 #3 / §5 implementation task 4).
 */
export interface ParseResult {
  spec: AgentSpec | WorkflowSpec;
  parserMode: SpecParserMode;
  /** What actually produced this spec: 'deterministic' | 'mock' | 'openai-compatible'. */
  provider: string;
  model: string | null;
}
