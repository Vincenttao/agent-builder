import { z } from 'zod';

/**
 * Agent Spec — the structured result of parsing a natural-language agent
 * request (PRD §7.2). Templates consume only the Spec, never the raw prompt
 * (P0 plan §6.5).
 */

export const agentToolSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  input_schema: z.record(z.string(), z.unknown()),
  output_schema: z.record(z.string(), z.unknown()),
});

export const agentSpecSchema = z.object({
  agent_id: z.string().min(1),
  name: z.string().min(1, 'Agent Spec 缺少 name'),
  description: z.string(),
  scenario: z.string(),
  /** P0 placeholder — real OpenJiuwen agent type name fixed after API inventory (PRD §7.2). */
  openjiuwen_agent_type: z.string().default('react_agent'),
  system_prompt: z.string().min(1),
  model: z.object({
    provider: z.string().default('openjiuwen'),
    model_name: z.string(),
    temperature: z.number().default(0.7),
  }),
  // FR-003 / Phase 2 checkpoint #4: an Agent Spec must define at least one tool.
  tools: z.array(agentToolSchema).min(1, 'Agent Spec 至少包含一个工具定义'),
  memory: z.object({
    enabled: z.boolean(),
    type: z.enum(['short_term', 'none']),
  }),
  examples: z
    .array(
      z.object({
        input: z.string(),
        expected_behavior: z.string(),
      }),
    )
    .default([]),
  acceptance_checks: z.array(z.string()).default([]),
});

export type AgentSpec = z.infer<typeof agentSpecSchema>;
export type AgentTool = z.infer<typeof agentToolSchema>;
