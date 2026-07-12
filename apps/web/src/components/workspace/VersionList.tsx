'use client';

import { useState } from 'react';
import type { ProjectVersion, VersionDiffResponse, VersionDiffFile } from '@agent-builder/shared-contracts';
import { TestStatus } from '@agent-builder/shared-contracts';
import { activateVersion, getVersionDiff } from '@/lib/api';

/**
 * Version list (P3-009). Shows every version for a generation, lets the user
 * activate any passed version, and inspect the diff vs the active version.
 */
export function VersionList({
  generationId,
  versions,
  activeVersionId,
}: {
  generationId: string;
  versions: ProjectVersion[];
  activeVersionId: string | null;
}) {
  const [diffFor, setDiffFor] = useState<string | null>(null);
  const [diff, setDiff] = useState<VersionDiffResponse | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (versions.length === 0) return null;

  async function toggleDiff(version: ProjectVersion) {
    if (diffFor === version.id) {
      setDiffFor(null);
      setDiff(null);
      return;
    }
    // Diff needs a base (the active version) different from the target.
    if (!activeVersionId || version.id === activeVersionId) {
      setError('当前为激活版本，无 Diff 可对比');
      return;
    }
    setDiffFor(version.id);
    setDiff(null);
    setError(null);
    try {
      const d = await getVersionDiff(generationId, version.id, activeVersionId);
      setDiff(d);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleActivate(version: ProjectVersion) {
    if (version.id === activeVersionId) return;
    setActivating(version.id);
    setError(null);
    try {
      await activateVersion(generationId, version.id);
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActivating(null);
    }
  }

  const statusTone: Record<string, string> = {
    [TestStatus.Passed]: 'bg-emerald-50 text-emerald-700',
    [TestStatus.Failed]: 'bg-red-50 text-red-700',
    [TestStatus.Skipped]: 'bg-zinc-100 text-zinc-500',
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3" data-testid="version-list">
      <p className="section-label">Versions</p>
      <p className="mt-1 text-[11px] text-zinc-500">共 {versions.length} 个版本，可激活已通过版本并查看 Diff</p>
      <ul className="mt-3 space-y-2 text-xs">
        {versions.map((v) => {
          const isActive = v.id === activeVersionId;
          return (
            <li key={v.id} className="rounded-md border border-zinc-200 px-2.5 py-2" data-testid={`version-${v.version_label}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium text-zinc-800">{v.version_label}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusTone[v.test_status] ?? 'bg-zinc-100 text-zinc-600'}`}>
                    {v.test_status}
                  </span>
                  {isActive && (
                    <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand" data-testid="active-tag">
                      active
                    </span>
                  )}
                </div>
                <span className="font-mono text-[10px] text-zinc-400">{v.file_count} files</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {!isActive && v.test_status === TestStatus.Passed && (
                  <button
                    type="button"
                    onClick={() => handleActivate(v)}
                    disabled={activating === v.id}
                    className="btn-secondary rounded px-2 py-0.5 text-[11px] font-medium"
                    data-testid={`activate-${v.version_label}`}
                  >
                    {activating === v.id ? '激活中…' : '激活'}
                  </button>
                )}
                {!isActive && (
                  <button
                    type="button"
                    onClick={() => toggleDiff(v)}
                    className="text-[11px] text-zinc-500 underline"
                    data-testid={`diff-toggle-${v.version_label}`}
                  >
                    {diffFor === v.id ? '隐藏 Diff' : '查看 Diff'}
                  </button>
                )}
              </div>
              {diffFor === v.id && diff && <DiffView files={diff} />}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700" data-testid="version-error">
          {error}
        </p>
      )}
    </div>
  );
}

function DiffView({ files }: { files: VersionDiffFile[] }) {
  const changed = files.filter((f) => f.status !== 'unchanged');
  if (changed.length === 0) {
    return <p className="mt-2 text-[11px] text-zinc-500">无差异</p>;
  }
  return (
    <div className="mt-2 space-y-1.5" data-testid="diff-view">
      {changed.map((f) => (
        <div key={f.path}>
          <p className="font-mono text-[11px] text-zinc-600">
            <span className={
              f.status === 'added' ? 'text-emerald-600' :
              f.status === 'deleted' ? 'text-red-600' :
              f.status === 'modified' ? 'text-amber-600' : 'text-zinc-500'
            }>
              {f.status === 'added' ? '+ ' : f.status === 'deleted' ? '- ' : '~ '}
            </span>
            {f.path}
          </p>
          {f.diff && (
            <pre className="mt-1 overflow-auto rounded bg-zinc-950 p-2 text-[10px] leading-4 text-zinc-100">
              {f.diff.slice(0, 1500)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
