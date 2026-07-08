import { Injectable } from '@nestjs/common';
import {
  AgentBuilderError,
  ErrorCode,
  GenerationType,
  type AgentSpec,
  type WorkflowSpec,
} from '@agent-builder/shared-contracts';
import { TAROT_AGENT_SPEC, PRESALES_WORKFLOW_SPEC } from './canonical-specs';

/**
 * Deterministic spec parser (P0 plan §6.5).
 *
 * P0 does NOT depend on an LLM parser — it recognizes the two PRD standard
 * demo prompts by keyword and returns the canonical Spec so the demos are
 * stable. Other prompts raise PROMPT_PARSE_FAILED (an LLM parser can be
 * slotted in later, but the deterministic path stays for the demos).
 */
@Injectable()
export class SpecParserService {
  parse(prompt: string, type: GenerationType): AgentSpec | WorkflowSpec {
    if (type === GenerationType.Agent) {
      if (prompt.includes('塔罗')) {
        return structuredClone(TAROT_AGENT_SPEC);
      }
      throw new AgentBuilderError(
        ErrorCode.PromptParseFailed,
        'P0 deterministic parser 暂仅支持「塔罗占卜 Agent」示例；其他需求将在 LLM parser 接入后支持。',
      );
    }
    // Workflow
    if (['需求', '方案', 'Demo', '报告'].some((k) => prompt.includes(k))) {
      return structuredClone(PRESALES_WORKFLOW_SPEC);
    }
    throw new AgentBuilderError(
      ErrorCode.PromptParseFailed,
      'P0 deterministic parser 暂仅支持「售前需求分析 Workflow」示例；其他需求将在 LLM parser 接入后支持。',
    );
  }
}
