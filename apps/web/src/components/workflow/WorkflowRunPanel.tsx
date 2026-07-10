'use client';

import { useState } from 'react';
import { workflowRun } from '@/lib/api';
import type { RunnerResult } from '@agent-builder/shared-contracts';

interface NodeRecord {
  node_id: string;
  name: string;
  status: string;
  duration_ms?: number;
}

/**
 * Workflow run panel (PRD FR-008, §12.4). Runs the workflow with a requirement
 * doc and shows per-node status + the final Markdown report.
 */
export function WorkflowRunPanel({ generationId }: { generationId: string }) {
  const [doc, setDoc] = useState('客户希望建设一个智能客服 Demo，两周内上线，预算有限。');
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (running) return;
    setRunning(true);
    setError(null);
    setNodes([]);
    setReport(null);
    try {
      const result: RunnerResult = await workflowRun(generationId, { requirement_doc: doc });
      setNodes((result.events as unknown as NodeRecord[]) ?? []);
      const out = result.output as Record<string, unknown> | null;
      setReport(
        (out?.report as string) ??
        (out?.result as string) ??
        (out ? JSON.stringify(out, null, 2) : null)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '运行失败');
    } finally {
      setRunning(false);
    }
  }

  const statusTone: Record<string, string> = {
    success: 'bg-emerald-50 text-emerald-700',
    failed: 'bg-red-50 text-red-700',
    running: 'bg-amber-50 text-amber-700',
    pending: 'bg-zinc-100 text-zinc-500',
  };

  return (
    <div className="surface flex h-full flex-col gap-4 rounded-lg p-4" data-testid="workflow-run-panel">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
        <div>
          <p className="section-label">Workflow Run</p>
          <h2 className="mt-1 text-sm font-semibold text-zinc-950">流程运行记录</h2>
        </div>
        <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-500">
          Node Trace
        </span>
      </div>

      <form onSubmit={run} className="flex gap-2">
        <textarea
          className="control flex-1 resize-none rounded-md px-3 py-2 text-xs leading-5"
          rows={2}
          aria-label="Workflow 输入"
          value={doc}
          onChange={(e) => setDoc(e.target.value)}
          data-testid="workflow-input"
        />
        <button
          type="submit"
          disabled={running}
          className="btn-primary self-start rounded-md px-4 py-2 text-xs font-semibold"
          data-testid="workflow-run"
        >
          {running ? '运行中…' : '运行 Workflow'}
        </button>
      </form>

      {nodes.length > 0 && (
        <div data-testid="workflow-nodes" className="overflow-hidden rounded-md border border-zinc-200">
          <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700">
            节点运行状态
          </div>
          <ul className="divide-y divide-zinc-100 text-xs">
            {nodes.map((n) => (
              <li key={n.node_id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2">
                <span className="truncate font-medium text-zinc-800">{n.name}</span>
                <span className="font-mono text-[11px] text-zinc-400">{n.duration_ms ? `${n.duration_ms}ms` : '-'}</span>
                <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${statusTone[n.status] ?? 'bg-zinc-100 text-zinc-600'}`} data-testid={`node-status-${n.node_id}`}>
                  {n.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report && (
        <pre className="overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-4 text-xs leading-6 whitespace-pre-wrap text-zinc-800" data-testid="workflow-report">
          {report}
        </pre>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" data-testid="workflow-error">
          {error}
        </p>
      )}
    </div>
  );
}
