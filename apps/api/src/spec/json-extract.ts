import { AgentBuilderError, ErrorCode } from '@agent-builder/shared-contracts';

/**
 * Extract a JSON object from an LLM text response (Phase 9 §5.5 / test #8).
 *
 * Models frequently wrap JSON in ```json fences or surround it with prose.
 * This isolates the outermost JSON object and parses it. Any failure is
 * normalized to PROMPT_PARSE_FAILED so the pipeline surfaces a single stable
 * error code for "LLM output could not be turned into a Spec".
 */
export function extractSpecJson(text: string): unknown {
  let candidate = text.trim();

  // 1. Strip a markdown code fence if the whole reply is fenced.
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    candidate = fence[1].trim();
  }

  // 2. Isolate the outermost JSON object (drop leading/trailing prose).
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new AgentBuilderError(
      ErrorCode.PromptParseFailed,
      'LLM 输出无法解析为 JSON：未找到 JSON 对象',
    );
  }
  candidate = candidate.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(candidate);
  } catch {
    throw new AgentBuilderError(
      ErrorCode.PromptParseFailed,
      'LLM 输出无法解析为 JSON：格式错误',
    );
  }
}
