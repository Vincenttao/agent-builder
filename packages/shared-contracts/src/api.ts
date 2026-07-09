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

// ─── Phase 14: Repair ────────────────────────────────────────────────

/** POST /api/generations/{id}/repair request. */
export const repairRequestSchema = z.object({
  instruction: z.string().max(2000).optional(),
});
export type RepairRequest = z.infer<typeof repairRequestSchema>;

/** POST /api/generations/{id}/repair response. */
export interface RepairResponse {
  generation_id: string;
  version_id: string;
  version_label: string;
  retry_index: number;
}

// ─── Phase 14: Versions ──────────────────────────────────────────────

/** GET /api/generations/{id}/versions — list all versions for a generation. */
export type VersionListResponse = import('./version').ProjectVersion[];

/** File-level diff between two versions. */
export interface VersionDiffFile {
  path: string;
  status: 'added' | 'deleted' | 'modified' | 'unchanged' | 'binary';
  /** Unified-diff hunks (only for text files with status=modified). */
  diff?: string;
}

/** GET /api/generations/{id}/versions/{vid}/diff?base={baseVid} */
export type VersionDiffResponse = VersionDiffFile[];

// ─── Phase 14: Run Logs ──────────────────────────────────────────────

/** GET /api/generations/{id}/runs — list sandbox jobs for a generation. */
export type RunListResponse = import('./sandbox').SandboxJob[];

/** GET /api/generations/{id}/runs/{runId}/logs?stream=stdout|stderr&tail=200 */
export interface RunLogResponse {
  run_id: string;
  stream: 'stdout' | 'stderr';
  tail: number;
  content: string;
  /** Total size of the (redacted) log file in bytes. */
  totalSize: number;
}

// ─── Phase 15: Draft / Confirm ───────────────────────────────────────

/** POST /api/generations/drafts request. */
export const createDraftRequestSchema = z.object({
  type: z.nativeEnum(GenerationType),
  prompt: z.string().min(1, 'prompt 不能为空').max(8000),
  mode: z.string().default('auto'),
  model: z.string().nullable().default('default'),
});
export type CreateDraftRequest = z.infer<typeof createDraftRequestSchema>;

export interface DraftResponse {
  draft_id: string;
  status: 'pending' | 'parsed' | 'failed' | 'confirmed';
  type: string;
  user_prompt: string;
  spec: unknown | null;
  parser_mode: string | null;
  provider: string | null;
  model: string | null;
  validation_status: string | null;
  error_message: string | null;
  created_at: string;
}

/** PUT /api/generations/drafts/{draftId}/spec request. */
export const updateDraftSpecSchema = z.object({
  spec: z.unknown(),
});
export type UpdateDraftSpecRequest = z.infer<typeof updateDraftSpecSchema>;

/** POST /api/generations/drafts/{draftId}/confirm response. */
export interface ConfirmDraftResponse {
  generation_id: string;
  status: string;
}

// ─── Phase 14: Task History ──────────────────────────────────────────

/** GET /api/generations?status=&limit=&offset= */
export interface ListGenerationsQuery {
  status?: string;
  limit?: number;
  offset?: number;
}
