/**
 * One-off real-LLM verification (Phase 13 §13 checkpoint #2). NOT a test —
 * a manual acceptance script. Delete after use (CLAUDE.md: debug scripts stay
 * local). Exercises the real OpenAiCompatibleSpecParser against a configured
 * OpenAI-compatible gateway and confirms the model's output parses + validates
 * into a real AgentSpec (proving the non-mock path the unit tests stub out).
 *
 * Run from apps/api:
 *   SPEC_LLM_BASE_URL=... SPEC_LLM_API_KEY=... SPEC_LLM_MODEL=... \
 *     npx ts-node --project tsconfig.json src/spec/verify-real-llm.ts
 */
import { OpenAiCompatibleSpecParser, createFetchChatCompletion } from './openai-compatible-spec-parser';
import { SpecValidatorService } from './spec-validator.service';
import { GenerationType, type AgentSpec } from '@agent-builder/shared-contracts';

async function main(): Promise<void> {
  const opts = {
    baseUrl: process.env.SPEC_LLM_BASE_URL ?? '',
    apiKey: process.env.SPEC_LLM_API_KEY ?? '',
    model: process.env.SPEC_LLM_MODEL ?? '',
    timeoutSeconds: Number(process.env.SPEC_LLM_TIMEOUT_SECONDS ?? '45'),
    maxRetries: Number(process.env.SPEC_LLM_MAX_RETRIES ?? '2'),
  };
  if (!opts.baseUrl || !opts.apiKey || !opts.model) {
    console.error('SPEC_LLM_BASE_URL / SPEC_LLM_API_KEY / SPEC_LLM_MODEL must be set');
    process.exit(2);
  }
  const parser = new OpenAiCompatibleSpecParser(opts, createFetchChatCompletion(opts));
  const validator = new SpecValidatorService();
  const prompt = '做一个天气查询 Agent，用户输入城市后调用工具返回该城市的天气信息。';
  console.log(`[real-llm] provider=openai-compatible model=${opts.model} prompt="${prompt}"`);
  const spec = (await parser.parse(prompt, GenerationType.Agent)) as AgentSpec;
  console.log('[real-llm] parsed name   :', spec.name);
  console.log('[real-llm] tools         :', spec.tools.map((t) => t.name));
  console.log('[real-llm] system_prompt :', spec.system_prompt.slice(0, 100));
  const validated = validator.validate(spec) as AgentSpec;
  console.log('[real-llm] validation    : PASS (name=' + validated.name + ', tools=' + validated.tools.length + ')');
}

main().catch((e: unknown) => {
  console.error('[real-llm] FAIL:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
