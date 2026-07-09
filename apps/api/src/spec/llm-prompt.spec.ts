import { buildLlmPrompt } from './llm-prompt';
import { GenerationType } from '@agent-builder/shared-contracts';

describe('buildLlmPrompt (Phase 9 §5.4 — LLM prompt constraints)', () => {
  it('produces a system + user message pair for an agent prompt', () => {
    const messages = buildLlmPrompt('做一个天气查询 Agent', GenerationType.Agent);
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0].role).toBe('system');
    expect(messages.some((m) => m.role === 'user')).toBe(true);
    const joined = messages.map((m) => m.content).join('\n');
    // JSON-only output
    expect(joined).toMatch(/JSON/i);
    // OpenJiuwen-only; denylist rival frameworks
    expect(joined).toContain('OpenJiuwen');
    expect(joined).not.toMatch(/LangGraph/);
    expect(joined).not.toMatch(/CrewAI/);
    expect(joined).not.toMatch(/Dify/);
  });

  it('for an agent prompt, requires at least one tool and names the AgentSpec fields', () => {
    const joined = buildLlmPrompt('天气查询', GenerationType.Agent)
      .map((m) => m.content)
      .join('\n');
    expect(joined).toMatch(/至少一个工具|至少 1 个工具|tools/);
    expect(joined).toContain('agent_id');
    expect(joined).toContain('system_prompt');
  });

  it('for a workflow prompt, requires start/end and ≥3 business nodes', () => {
    const joined = buildLlmPrompt('合同审核', GenerationType.Workflow)
      .map((m) => m.content)
      .join('\n');
    expect(joined).toMatch(/start/i);
    expect(joined).toMatch(/end/i);
    expect(joined).toMatch(/3.*业务节点|business node/i);
    expect(joined).toContain('nodes');
  });
});
