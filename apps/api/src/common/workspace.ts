import path from 'node:path';
import fs from 'node:fs';

/**
 * Workspace filesystem layout (architecture §10):
 *   workspace/
 *   ├── metadata.db          (gitignored)
 *   ├── generated/{gen_id}/{ver_id}/   generated projects
 *   ├── runs/{run_id}/{stdout,stderr}.log
 *   ├── exports/{export_id}.zip
 *   └── logs/
 *
 * The API process runs with cwd = apps/api, so the repo root is two levels up.
 * Override with WORKSPACE_DIR for tests / production mounts.
 */
function resolveRepoRoot(): string {
  if (process.env.WORKSPACE_DIR) {
    return path.dirname(process.env.WORKSPACE_DIR);
  }
  return path.resolve(process.cwd(), '..', '..');
}

export const REPO_ROOT = resolveRepoRoot();

export const WORKSPACE_DIR = process.env.WORKSPACE_DIR ?? path.join(REPO_ROOT, 'workspace');

export const GENERATED_DIR = path.join(WORKSPACE_DIR, 'generated');
export const RUNS_DIR = path.join(WORKSPACE_DIR, 'runs');
export const EXPORTS_DIR = path.join(WORKSPACE_DIR, 'exports');
export const LOGS_DIR = path.join(WORKSPACE_DIR, 'logs');

export const DEFAULT_METADATA_DB_PATH = path.join(WORKSPACE_DIR, 'metadata.db');

/** Ensure the workspace subtree exists. Safe to call repeatedly. */
export function ensureWorkspaceDirs(): void {
  for (const dir of [WORKSPACE_DIR, GENERATED_DIR, RUNS_DIR, EXPORTS_DIR, LOGS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Project root for a generation/version (architecture §5.4). */
export function projectRoot(generationId: string, versionId: string): string {
  return path.join(GENERATED_DIR, generationId, versionId);
}

/** Convert an absolute workspace path to a workspace-relative path for DTOs
 * (architecture §5.2 — only project-relative paths are returned to clients). */
export function toWorkspaceRelative(absPath: string | null): string | null {
  if (!absPath) return null;
  const rel = path.relative(WORKSPACE_DIR, absPath);
  return rel || null;
}

/** Absolute path to the Python Runner source (for PYTHONPATH in the sandbox). */
export const PYTHON_RUNNER_SRC = path.join(REPO_ROOT, 'services', 'python-runner', 'src');
