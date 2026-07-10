import type {
  CreateGenerationRequest,
  CreateGenerationResponse,
  GenerationDto,
  FileTreeNode,
  FileContentResponse,
  RunnerResult,
  CreateExportResponse,
} from '@agent-builder/shared-contracts';

/** REST client for the Agent Builder backend (proxied via next.config rewrites). */

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const signal = init?.signal ?? AbortSignal.timeout(30_000);
  const res = await fetch(url, { ...init, signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { message?: string }).message ?? `请求失败 (${res.status})`;
    const error = new Error(message) as Error & { error_code?: string; status?: number };
    error.error_code = (data as { error_code?: string }).error_code;
    error.status = res.status;
    throw error;
  }
  return data as T;
}

export function createGeneration(req: CreateGenerationRequest): Promise<CreateGenerationResponse> {
  return jsonFetch('/api/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export function getGeneration(id: string): Promise<GenerationDto> {
  return jsonFetch(`/api/generations/${id}`);
}

export function getFileTree(id: string): Promise<FileTreeNode[]> {
  return jsonFetch(`/api/generations/${id}/files`);
}

export function getFileContent(id: string, path: string): Promise<FileContentResponse> {
  return jsonFetch(`/api/generations/${id}/files/content?path=${encodeURIComponent(path)}`);
}

export function agentRun(id: string, message: string): Promise<RunnerResult> {
  return jsonFetch(`/api/generations/${id}/agent/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
}

export function workflowRun(id: string, inputs: Record<string, unknown>): Promise<RunnerResult> {
  return jsonFetch(`/api/generations/${id}/workflow/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs }),
  });
}

export function exportProject(id: string): Promise<CreateExportResponse> {
  return jsonFetch(`/api/generations/${id}/exports`, { method: 'POST' });
}

export function exportDownloadUrl(exportId: string): string {
  return `/api/exports/${exportId}/download`;
}

// ─── Phase 14: Repair ──────────────────────────────────────────────

export function repairGeneration(id: string, instruction?: string): Promise<{ generation_id: string; version_id: string; version_label: string; retry_index: number }> {
  return jsonFetch(`/api/generations/${id}/repair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction }),
  });
}

// ─── Phase 14: Versions ────────────────────────────────────────────

export function getVersions(id: string): Promise<import('@agent-builder/shared-contracts').ProjectVersion[]> {
  return jsonFetch(`/api/generations/${id}/versions`);
}

export function getVersionDiff(id: string, versionId: string, baseVersionId: string): Promise<import('@agent-builder/shared-contracts').VersionDiffResponse> {
  return jsonFetch(`/api/generations/${id}/versions/${versionId}/diff?base=${encodeURIComponent(baseVersionId)}`);
}

export function activateVersion(id: string, versionId: string): Promise<{ version_id: string; version_label: string; active: boolean }> {
  return jsonFetch(`/api/generations/${id}/versions/${versionId}/activate`, { method: 'POST' });
}

// ─── Phase 14: Run Logs ────────────────────────────────────────────

export function getRuns(id: string): Promise<import('@agent-builder/shared-contracts').RunListResponse> {
  return jsonFetch(`/api/generations/${id}/runs`);
}

export function getRunLog(id: string, runId: string, stream: 'stdout' | 'stderr' = 'stdout', tail = 200): Promise<import('@agent-builder/shared-contracts').RunLogResponse> {
  return jsonFetch(`/api/generations/${id}/runs/${runId}/logs?stream=${stream}&tail=${tail}`);
}

// ─── Phase 14: Task History ────────────────────────────────────────

export function listGenerations(status?: string, limit = 20, offset = 0): Promise<import('@agent-builder/shared-contracts').GenerationDto[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return jsonFetch(`/api/generations?${params.toString()}`);
}

// ─── Phase 15: Draft / Confirm ─────────────────────────────────────

export function createDraft(req: import('@agent-builder/shared-contracts').CreateDraftRequest): Promise<import('@agent-builder/shared-contracts').DraftResponse> {
  return jsonFetch('/api/generations/drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export function getDraft(draftId: string): Promise<import('@agent-builder/shared-contracts').DraftResponse> {
  return jsonFetch(`/api/generations/drafts/${draftId}`);
}

export function updateDraftSpec(draftId: string, spec: unknown): Promise<import('@agent-builder/shared-contracts').DraftResponse> {
  return jsonFetch(`/api/generations/drafts/${draftId}/spec`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spec }),
  });
}

export function confirmDraft(draftId: string): Promise<import('@agent-builder/shared-contracts').ConfirmDraftResponse> {
  return jsonFetch(`/api/generations/drafts/${draftId}/confirm`, { method: 'POST' });
}
