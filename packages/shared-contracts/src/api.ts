import { z } from 'zod';
import { GenerationType } from './generation';

/**
 * POST /api/generations request (PRD §11.1, FR-001).
 * P0 only accepts `agent` | `workflow` — `skill` is rejected (PRD §4.2).
 */
export const createGenerationRequestSchema = z.object({
  type: z.nativeEnum(GenerationType),
  prompt: z.string().min(1, 'prompt 不能为空').max(8000),
  mode: z.string().default('auto'),
  model: z.string().nullable().default('default'),
});

export type CreateGenerationRequest = z.infer<typeof createGenerationRequestSchema>;

/** POST /api/generations response (PRD §11.1). */
export interface CreateGenerationResponse {
  generation_id: string;
  status: string;
}

/** POST /api/generations/{id}/agent/runs request (PRD §11.6). */
export const agentRunRequestSchema = z.object({
  message: z.string().min(1).max(8000),
});
export type AgentRunRequest = z.infer<typeof agentRunRequestSchema>;

/** POST /api/generations/{id}/workflow/runs request (PRD §11.7). */
export const workflowRunRequestSchema = z.object({
  inputs: z.record(z.string(), z.unknown()).default({}),
});
export type WorkflowRunRequest = z.infer<typeof workflowRunRequestSchema>;

/** File tree node (architecture §8.4). */
export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

export interface FileContentResponse {
  path: string;
  content: string;
  size: number;
}

/** POST /api/generations/{id}/exports response (PRD §11.8). */
export interface CreateExportResponse {
  export_id: string;
  download_url: string;
}
