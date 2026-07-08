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
  const res = await fetch(url, init);
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
