import { z } from 'zod';

/**
 * Workflow Spec — the structured result of parsing a natural-language workflow
 * request (PRD §7.3). Node `type` values are P0 placeholders, to be mapped to
 * real OpenJiuwen Component APIs after the API inventory (PRD §7.3).
 */

export const workflowNodeTypeSchema = z.enum([
  'start',
  'llm',
  'tool',
  'python',
  'condition',
  'export',
  'end',
]);

export const workflowNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: workflowNodeTypeSchema,
  description: z.string(),
  input_schema: z.record(z.string(), z.unknown()).default({}),
  output_schema: z.record(z.string(), z.unknown()).default({}),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const workflowEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  condition: z.string().nullable().default(null),
});

export const workflowSpecSchema = z.object({
  workflow_id: z.string().min(1),
  name: z.string().min(1, 'Workflow Spec 缺少 name'),
  description: z.string(),
  openjiuwen_workflow_type: z.string().default('workflow'),
  inputs: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        required: z.boolean(),
      }),
    )
    .default([]),
  outputs: z.array(z.object({ name: z.string(), type: z.string() })).default([]),
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema).default([]),
  acceptance_checks: z.array(z.string()).default([]),
});

export type WorkflowSpec = z.infer<typeof workflowSpecSchema>;
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;
export type WorkflowNodeType = z.infer<typeof workflowNodeTypeSchema>;
