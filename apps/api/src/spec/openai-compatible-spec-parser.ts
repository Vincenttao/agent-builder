import { Injectable, Logger } from '@nestjs/common';
import {
  AgentBuilderError,
  ErrorCode,
  GenerationType,
  type AgentSpec,
  type WorkflowSpec,
} from '@agent-builder/shared-contracts';
import type { LlmSpecParser } from './llm-spec-parser';
import { buildLlmPrompt, type ChatMessage } from './llm-prompt';
import { extractSpecJson } from './json-extract';

export interface OpenAiCompatibleOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutSeconds: number;
  maxRetries: number;
}

/** Transport abstraction so the parser is unit-testable without network. */
export type ChatCompletionFn = (params: {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  timeoutMs: number;
}) => Promise<string>;

/**
 * Real LLM spec parser against an OpenAI-compatible Chat Completions endpoint
 * (Phase 9 §5.3). The model is constrained to JSON-only output (buildLlmPrompt);
 * its text is run through extractSpecJson; the result is NOT validated here —
 * the caller runs SpecValidatorService (security boundary §3.3.1/§3.3.2).
 *
 * Transient failures (network / HTTP / unparseable JSON) are retried up to
 * `maxRetries`; the final failure is normalized to PROMPT_PARSE_FAILED so the
 * pipeline surfaces a single stable code (never the P0 demo-limitation copy).
 */
@Injectable()
export class OpenAiCompatibleSpecParser implements LlmSpecParser {
  private readonly logger = new Logger(OpenAiCompatibleSpecParser.name);
  readonly provider = 'openai-compatible' as const;
  get model(): string | null {
    return this.opts.model;
  }

  constructor(
    private readonly opts: OpenAiCompatibleOptions,
    private readonly chatCompletion: ChatCompletionFn,
  ) {}

  async parse(prompt: string, type: GenerationType): Promise<AgentSpec | WorkflowSpec> {
    const messages = buildLlmPrompt(prompt, type);
    let attempt = 0;
    let lastErr: unknown = null;
    while (attempt <= this.opts.maxRetries) {
      try {
        const content = await this.chatCompletion({
          model: this.opts.model,
          messages,
          temperature: 0,
          timeoutMs: this.opts.timeoutSeconds * 1000,
        });
        return extractSpecJson(content) as AgentSpec | WorkflowSpec;
      } catch (err) {
        lastErr = err;
        attempt++;
        this.logger.warn(
          `spec LLM attempt ${attempt} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (lastErr instanceof AgentBuilderError) throw lastErr;
    const reason = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new AgentBuilderError(ErrorCode.PromptParseFailed, `LLM 不可用：${reason}`);
  }
}

/**
 * Production transport: POST `${baseUrl}/chat/completions` with a Bearer key,
 * abort after `timeoutMs`. Returns the assistant `content`. Throws on non-2xx,
 * timeout, or a missing `choices[0].message.content` — the parser retries these.
 */
export function createFetchChatCompletion(opts: OpenAiCompatibleOptions): ChatCompletionFn {
  return async ({ model, messages, temperature, timeoutMs }) => {
    const url = `${opts.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages, temperature, stream: false }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('LLM 响应缺少 choices[0].message.content');
      return content;
    } finally {
      clearTimeout(timer);
    }
  };
}
