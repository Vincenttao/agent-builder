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
      setReport((result.output as { report?: string } | null)?.report ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '运行失败');
    } finally {
      setRunning(false);
    }
  }

  const statusTone: Record<string, string> = {
    success: 'text-emerald-600',
    failed: 'text-red-600',
    running: 'text-amber-600',
    pending: 'text-slate-400',
  };

  return (
    <div className="flex h-full flex-col gap-3" data-testid="workflow-run-panel">
      <form onSubmit={run} className="flex gap-2">
        <textarea
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          rows={2}
          value={doc}
          onChange={(e) => setDoc(e.target.value)}
          data-testid="workflow-input"
        />
        <button
          type="submit"
          disabled={running}
          className="self-start rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          data-testid="workflow-run"
        >
          {running ? '运行中…' : '运行 Workflow'}
        </button>
      </form>

      {nodes.length > 0 && (
        <div data-testid="workflow-nodes" className="rounded-lg border border-slate-200 p-2">
          <h4 className="mb-1 text-xs font-semibold text-slate-500">节点运行状态</h4>
          <ul className="text-sm">
            {nodes.map((n) => (
              <li key={n.node_id} className="flex justify-between py-0.5">
                <span>{n.name}</span>
                <span className={statusTone[n.status] ?? 'text-slate-600'} data-testid={`node-status-${n.node_id}`}>
                  {n.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report && (
        <pre className="overflow-auto rounded bg-slate-50 p-3 text-xs whitespace-pre-wrap" data-testid="workflow-report">
          {report}
        </pre>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600" data-testid="workflow-error">
          {error}
        </p>
      )}
    </div>
  );
}
