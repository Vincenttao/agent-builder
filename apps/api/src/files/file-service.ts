import fs from 'node:fs';
import path from 'node:path';
import type { FileTreeNode, FileContentResponse } from '@agent-builder/shared-contracts';

/**
 * File tree scanning + path-safe content reading + export filtering
 * (architecture §8.4, §10; runtime_and_sandbox §13; PRD §10.3).
 *
 * Path safety: `path` must be relative, contain no `..`, and resolve inside
 * the project root — `../../etc/passwd` is rejected (P0 plan §6.2 test #6,
 * Phase 8 security regression).
 */

/** Patterns excluded from the export zip (runtime_and_sandbox §13). */
const EXPORT_EXCLUDE = [
  /^\.env$/,
  /^\.env\..*$/, // .env.local etc. — but KEEP .env.example
  /^\.venv(\/|$)/,
  /^venv(\/|$)/,
  /^__pycache__(\/|$)/,
  /^\.pytest_cache(\/|$)/,
  /\.pyc$/,
  /\.log$/,
  /^\.agent_builder\/secrets(\/|$)/,
  /^\.opencode\/cache(\/|$)/,
];

export function isExportAllowed(relPath: string): boolean {
  const normalized = relPath.replace(/^\.\//, '').replace(/\\/g, '/');
  // .env.example is explicitly allowed; other .env* are not.
  if (normalized === '.env.example') return true;
  return !EXPORT_EXCLUDE.some((re) => re.test(normalized));
}

/** Assert `relPath` is a safe relative path inside `projectRoot`. */
export function assertSafePath(projectRoot: string, relPath: string): string {
  if (!relPath || path.isAbsolute(relPath) || relPath.includes('..')) {
    throw new PathSafetyError(`非法文件路径：${relPath}`);
  }
  const resolved = path.resolve(projectRoot, relPath);
  const root = path.resolve(projectRoot);
  // resolved must be the root itself or within it.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new PathSafetyError(`文件路径越界：${relPath}`);
  }
  return resolved;
}

export class PathSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathSafetyError';
  }
}

/** Scan the project tree (directories + files, recursive). */
export function scanTree(projectRoot: string, base = ''): FileTreeNode[] {
  const dir = base ? path.join(projectRoot, base) : projectRoot;
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const nodes: FileTreeNode[] = [];
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: rel,
        type: 'directory',
        children: scanTree(projectRoot, rel),
      });
    } else {
      const size = fs.statSync(path.join(dir, entry.name)).size;
      nodes.push({ name: entry.name, path: rel, type: 'file', children: undefined });
      void size;
    }
  }
  return nodes;
}

/** Read a file by project-relative path (path-safe). */
export function readFileSafe(projectRoot: string, relPath: string): FileContentResponse {
  const full = assertSafePath(projectRoot, relPath);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    throw new PathSafetyError(`文件不存在：${relPath}`);
  }
  const content = fs.readFileSync(full, 'utf8');
  return { path: relPath, content, size: Buffer.byteLength(content) };
}

/** List of files included in an export (flat, filtered). */
export function listExportableFiles(projectRoot: string): string[] {
  const out: string[] = [];
  const walk = (base: string) => {
    const dir = base ? path.join(projectRoot, base) : projectRoot;
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(rel);
      } else if (isExportAllowed(rel)) {
        out.push(rel);
      }
    }
  };
  walk('');
  return out;
}
