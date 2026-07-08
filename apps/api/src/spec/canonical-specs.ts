import type { AgentSpec, WorkflowSpec } from '@agent-builder/shared-contracts';

/**
 * Canonical Specs for the two PRD standard demo prompts (PRD §5.2).
 *
 * The deterministic parser returns these verbatim (keyword-matched) so the two
 * demos always produce stable Specs (P0 plan §6.4 checkpoint #1). Templates
 * consume only the Spec — the raw prompt is never concatenated into code
 * (P0 plan §6.5 note 3).
 */

export const TAROT_AGENT_SPEC: AgentSpec = {
  agent_id: 'tarot_divination_agent',
  name: '塔罗牌占卜 Agent',
  description: '一个塔罗牌占卜 Agent，先询问用户占卜问题，再抽牌并解读。',
  scenario: '塔罗占卜',
  openjiuwen_agent_type: 'react_agent',
  system_prompt: [
    '你是一位塔罗占卜师。请严格按以下流程与用户交互：',
    '1. 先询问用户想要占卜的具体问题。',
    '2. 用户回答后，调用 draw_tarot 抽牌工具抽取塔罗牌。',
    '3. 根据抽到的牌名、正逆位与含义，结合用户的问题给出解读。',
    '4. 解读需包含每一张抽到的牌，并在结尾给出简短的综合建议。',
  ].join('\n'),
  model: {
    provider: 'openjiuwen',
    model_name: 'default',
    temperature: 0.7,
  },
  tools: [
    {
      name: 'draw_tarot',
      description: '随机抽取塔罗牌，返回牌名、正逆位与含义。',
      input_schema: { count: 'integer' },
      output_schema: { cards: 'array<{name, reversed, meaning}>' },
    },
  ],
  memory: { enabled: true, type: 'short_term' },
  examples: [
    {
      input: '我想看看最近职业发展的趋势',
      expected_behavior: '先询问具体问题，调用抽牌工具，再给出解读',
    },
  ],
  acceptance_checks: [
    'Agent 能正确调用抽牌工具',
    '解读包含抽到的牌名、正逆位与含义',
  ],
};

export const PRESALES_WORKFLOW_SPEC: WorkflowSpec = {
  workflow_id: 'presales_requirement_analysis',
  name: '售前需求分析 Workflow',
  description:
    '读取客户需求文档，抽取客户目标和限制条件，匹配可演示的解决方案，生成 Demo 清单并输出 Markdown 报告。',
  openjiuwen_workflow_type: 'workflow',
  inputs: [
    { name: 'requirement_doc', type: 'string', required: true },
  ],
  outputs: [{ name: 'report', type: 'markdown' }],
  nodes: [
    {
      id: 'start',
      name: 'Start',
      type: 'start',
      description: '流程入口，接收客户需求文档。',
      input_schema: { requirement_doc: 'string' },
      output_schema: { requirement_doc: 'string' },
      config: {},
    },
    {
      id: 'extract_requirement',
      name: '需求抽取',
      type: 'llm',
      description: '从需求文档抽取客户目标与限制条件。',
      input_schema: { requirement_doc: 'string' },
      output_schema: { goals: 'string[]', constraints: 'string[]' },
      config: { prompt: '抽取客户目标和限制条件' },
    },
    {
      id: 'match_solution',
      name: '方案匹配',
      type: 'llm',
      description: '根据目标与限制匹配可演示的解决方案。',
      input_schema: { goals: 'string[]', constraints: 'string[]' },
      output_schema: { solutions: 'string[]' },
      config: { prompt: '匹配可演示的解决方案' },
    },
    {
      id: 'generate_demo_plan',
      name: 'Demo 清单生成',
      type: 'python',
      description: '根据解决方案生成 Demo 清单。',
      input_schema: { solutions: 'string[]' },
      output_schema: { demo_list: 'string[]' },
      config: { handler: 'generate_demo_plan' },
    },
    {
      id: 'export_report',
      name: '报告输出',
      type: 'export',
      description: '将目标、限制、方案与 Demo 清单汇总为 Markdown 报告。',
      input_schema: { goals: 'string[]', constraints: 'string[]', solutions: 'string[]', demo_list: 'string[]' },
      output_schema: { report: 'markdown' },
      config: { format: 'markdown' },
    },
    {
      id: 'end',
      name: 'End',
      type: 'end',
      description: '流程出口，输出最终报告。',
      input_schema: { report: 'markdown' },
      output_schema: { report: 'markdown' },
      config: {},
    },
  ],
  edges: [
    { from: 'start', to: 'extract_requirement', condition: null },
    { from: 'extract_requirement', to: 'match_solution', condition: null },
    { from: 'match_solution', to: 'generate_demo_plan', condition: null },
    { from: 'generate_demo_plan', to: 'export_report', condition: null },
    { from: 'export_report', to: 'end', condition: null },
  ],
  acceptance_checks: [
    'Workflow 包含 Start 与 End',
    '节点按顺序执行：需求抽取 → 方案匹配 → Demo 清单 → 报告输出',
    '最终输出为 Markdown 报告',
  ],
};
