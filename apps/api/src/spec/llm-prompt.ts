import { GenerationType } from '@agent-builder/shared-contracts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const AGENT_SCHEMA_DESC =
  'agent_id (string), name (string), description (string), scenario (string), ' +
  'openjiuwen_agent_type (string, 默认 react_agent), system_prompt (string, 非空), ' +
  'model {provider, model_name, temperature}, ' +
  'tools [{name, description, input_schema, output_schema}], ' +
  'memory {enabled, type (short_term|none)}, examples [], acceptance_checks [].';

const AGENT_RULES = 'tools 数组至少 1 个工具；system_prompt 非空；name 非空。';

const WORKFLOW_SCHEMA_DESC =
  'workflow_id, name, description, openjiuwen_workflow_type, inputs [], outputs [], ' +
  'nodes [{id, name, type, description, input_schema, output_schema, config}], ' +
  'edges [{from, to, condition}], acceptance_checks []. ' +
  'node.type 枚举：start, llm, tool, python, condition, export, end.';

const WORKFLOW_RULES =
  'nodes 必须包含一个 type=start 的 Start 节点和一个 type=end 的 End 节点；' +
  '至少 3 个业务节点（非 start/end）；edges 的 from/to 必须引用已存在的节点 id。';

/**
 * Build the LLM prompt for spec generation (Phase 9 §5.4 / §3.3.1).
 *
 * The model is told to output ONLY JSON (never concatenated into code), to use
 * the OpenJiuwen framework exclusively, and to satisfy the structural rules the
 * validator will enforce. Rival frameworks are not named (positive constraint)
 * so the prompt text never carries their identifiers.
 */
export function buildLlmPrompt(prompt: string, type: GenerationType): ChatMessage[] {
  const isAgent = type === GenerationType.Agent;
  const schema = isAgent ? AGENT_SCHEMA_DESC : WORKFLOW_SCHEMA_DESC;
  const rules = isAgent ? AGENT_RULES : WORKFLOW_RULES;
  const target = isAgent ? 'AgentSpec' : 'WorkflowSpec';

  const system = [
    `你是一个 Spec 生成器。根据用户的需求描述，输出一个合法的 ${target} JSON 对象。`,
    '只输出 JSON，不要输出 Markdown 代码块、解释或任何前后缀文字。',
    '工程必须基于 OpenJiuwen 框架，不得引入任何第三方 Agent 编排框架。',
    `JSON 字段：${schema}`,
    `结构约束：${rules}`,
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: prompt },
  ];
}
