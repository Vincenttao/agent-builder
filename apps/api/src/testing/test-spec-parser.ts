import { Injectable } from '@nestjs/common';
import { GenerationType, type AgentSpec, type WorkflowSpec } from '@agent-builder/shared-contracts';
import type { LlmSpecParser } from '../spec/llm-spec-parser';

/** Deterministic parser used only by tests. */
@Injectable()
export class TestSpecParser implements LlmSpecParser {
  readonly provider = 'test' as const;
  readonly model = null;

  async parse(prompt: string, type: GenerationType): Promise<AgentSpec | WorkflowSpec> {
    if (type === GenerationType.Agent) {
      return structuredClone(GENERIC_AGENT_SPEC);
    }
    return structuredClone(GENERIC_WORKFLOW_SPEC);
  }
}

const GENERIC_AGENT_SPEC: AgentSpec = {
  agent_id: 'generic_agent',
  name: '通用智能体',
  description: '一个通用智能体，根据用户输入调用工具并给出回复。',
  scenario: '通用对话与工具调用',
  openjiuwen_agent_type: 'react_agent',
  system_prompt:
    '你是一个通用智能体。根据用户的问题，调用 query_info 工具获取相关信息，然后给出与问题相关的回复。',
  model: { provider: 'openjiuwen', model_name: 'default', temperature: 0.7 },
  tools: [
    {
      name: 'query_info',
      description: '根据关键词查询相关信息。',
      input_schema: { keyword: 'string' },
      output_schema: { result: 'string' },
    },
  ],
  memory: { enabled: true, type: 'short_term' },
  examples: [],
  acceptance_checks: ['能调用 query_info 工具', '回复与用户问题相关'],
};

const GENERIC_WORKFLOW_SPEC: WorkflowSpec = {
  workflow_id: 'generic_workflow',
  name: '通用处理工作流',
  description: '一个通用处理工作流：分析输入、调用工具处理、生成输出。',
  openjiuwen_workflow_type: 'workflow',
  inputs: [{ name: 'user_input', type: 'string', required: true }],
  outputs: [{ name: 'result', type: 'string' }],
  nodes: [
    {
      id: 'start',
      name: 'Start',
      type: 'start',
      description: '流程入口，接收用户输入。',
      input_schema: { user_input: 'string' },
      output_schema: { user_input: 'string' },
      config: {},
    },
    {
      id: 'analyze',
      name: '分析',
      type: 'llm',
      description: '分析用户输入。',
      input_schema: { user_input: 'string' },
      output_schema: { analysis: 'string' },
      config: { prompt: '分析用户输入' },
    },
    {
      id: 'process',
      name: '处理',
      type: 'tool',
      description: '调用工具处理分析结果。',
      input_schema: { analysis: 'string' },
      output_schema: { processed: 'string' },
      config: {},
    },
    {
      id: 'report',
      name: '输出',
      type: 'python',
      description: '生成最终输出。',
      input_schema: { processed: 'string' },
      output_schema: { result: 'string' },
      config: {},
    },
    {
      id: 'end',
      name: 'End',
      type: 'end',
      description: '流程出口，输出最终结果。',
      input_schema: { result: 'string' },
      output_schema: { result: 'string' },
      config: {},
    },
  ],
  edges: [
    { from: 'start', to: 'analyze', condition: null },
    { from: 'analyze', to: 'process', condition: null },
    { from: 'process', to: 'report', condition: null },
    { from: 'report', to: 'end', condition: null },
  ],
  acceptance_checks: ['Workflow 包含 Start 与 End', '节点按顺序执行', '最终输出为结果文本'],
};
