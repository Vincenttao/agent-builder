'use client';

import { useEffect, useState } from 'react';
import type { GenerationDto, FileTreeNode, FileContentResponse } from '@agent-builder/shared-contracts';
import { EventType, GenerationStatus } from '@agent-builder/shared-contracts';
import { getGeneration, getFileTree, getFileContent, exportProject, exportDownloadUrl } from '@/lib/api';
import { useGenerationEvents } from '@/lib/use-generation-events';
import { GenerationTimeline } from '@/components/workspace/GenerationTimeline';
import { CompletionSummary } from '@/components/workspace/CompletionSummary';
import { ErrorPanel } from '@/components/workspace/ErrorPanel';
import { AgentTestPanel } from '@/components/agent/AgentTestPanel';
import { WorkflowRunPanel } from '@/components/workflow/WorkflowRunPanel';
import { FileTree } from '@/components/source/FileTree';
import { CodeViewer } from '@/components/source/CodeViewer';
import { OutputPanel } from '@/components/bottom/OutputPanel';

const STATUS_LABEL: Record<string, string> = {
  pending: '等待',
  planning: '规划中',
  generating: '生成中',
  testing: '测试中',
  completed: '已完成',
  failed: '失败',
};

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-zinc-100 text-zinc-600',
  planning: 'bg-cyan-50 text-cyan-700',
  generating: 'bg-amber-50 text-amber-700',
  testing: 'bg-teal-50 text-teal-700',
  completed: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
};

/** Generation workspace (PRD §12.2). */
export function GenerationWorkspace({ id }: { id: string }) {
  const { events, status, connected, reconnecting } = useGenerationEvents(id);
  const [gen, setGen] = useState<GenerationDto | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [tab, setTab] = useState<'run' | 'source'>('run');
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getGeneration(id)
      .then((g) => { if (!cancelled) { setGen(g); setGenError(null); } })
      .catch((e) => { if (!cancelled) setGenError((e as Error).message); });
    return () => { cancelled = true; };
  }, [id]);

  // Refresh the file tree as generation events arrive. A single early fetch can
  // race with file writes and leave the Source tab empty after completion.
  const showFiles = Boolean(status && ![GenerationStatus.Pending, GenerationStatus.Planning].includes(status));
  const fileEventWatermark = events.reduce((latest, event) => {
    if (event.type === EventType.FileCreated || event.type === EventType.FileUpdated) {
      return Math.max(latest, event.sequence);
    }
    return latest;
  }, 0);
  useEffect(() => {
    if (!showFiles) return;
    let cancelled = false;
    getFileTree(id)
      .then((t) => { if (!cancelled) { setTree(t); setTreeError(null); } })
      .catch((e) => { if (!cancelled) setTreeError((e as Error).message); });
    return () => { cancelled = true; };
  }, [id, showFiles, status, tab, fileEventWatermark]);

  // Auto-open the default source file once the file tree is ready (P2 D5).
  useEffect(() => {
    if (!gen || tree.length === 0 || selectedPath) return;
    const isAgent = gen.type === 'agent';
    const defaultPattern = isAgent ? 'agent.py' : 'workflow.py';
    // Search the tree for the default file in a src/ subdirectory.
    function findDefault(nodes: FileTreeNode[]): string | null {
      for (const n of nodes) {
        if (n.type === 'file' && n.name === defaultPattern && n.path.includes('/src/')) {
          return n.path;
        }
        if (n.children) {
          const found = findDefault(n.children);
          if (found) return found;
        }
      }
      // Fallback: any match anywhere.
      for (const n of nodes) {
        if (n.type === 'file' && n.name === defaultPattern) return n.path;
        if (n.children) {
          const found = findDefault(n.children);
          if (found) return found;
        }
      }
      return null;
    }
    const defaultPath = findDefault(tree);
    if (defaultPath) selectFile(defaultPath);
  // Only fire once on first tree load; selectedPath guard prevents re-fires.
  }, [tree, gen]);

  async function selectFile(path: string) {
    setSelectedPath(path);
    setContent(null);
    try {
      const res: FileContentResponse = await getFileContent(id, path);
      setContent(res.content);
    } catch {
      setContent('// 无法加载文件内容');
    }
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const { export_id } = await exportProject(id);
      // Trigger download via an anchor (testable, no full navigation).
      const a = document.createElement('a');
      a.href = exportDownloadUrl(export_id);
      a.download = `${export_id}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setExporting(false);
    }
  }

  function handleRepair(_newVersionLabel: string) {
    // Reload the page so the new version events stream in.
    window.location.reload();
  }

  const isCompleted = status === GenerationStatus.Completed;
  const isFailed = status === GenerationStatus.Failed;
  const isWorkflow = gen?.type === 'workflow';
  const loadError = genError ?? treeError;

  return (
    <div className="flex h-screen flex-col bg-zinc-100 text-zinc-950">
      {loadError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700" data-testid="load-error">
          加载失败：{loadError}
          <button
            onClick={() => window.location.reload()}
            className="ml-3 underline"
          >
            重试
          </button>
        </div>
      )}
      <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => (window.location.href = '/')}
            className="btn-secondary rounded-md px-2.5 py-1.5 text-xs font-medium"
          >
            首页
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-zinc-950">{gen?.title ?? '生成工作台'}</h1>
            <p className="text-[11px] text-zinc-500">
              {gen?.type === 'workflow' ? 'Workflow' : 'Agent'} / {id}
            </p>
          </div>
          <span
            className={`rounded px-2 py-1 text-[11px] font-medium ${STATUS_TONE[status ?? 'pending'] ?? 'bg-zinc-100 text-zinc-600'}`}
            data-testid="status-badge"
          >
            {STATUS_LABEL[status ?? 'pending'] ?? status}
          </span>
          {!connected && (
            <span className="rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700" data-testid="reconnect-indicator">
              {reconnecting ? '重连中…' : '已断开'}
            </span>
          )}
        </div>
        <button
          onClick={handleExport}
          disabled={!isCompleted || exporting}
          className="btn-primary rounded-md px-3 py-1.5 text-xs font-semibold"
          data-testid="export-button"
        >
          {exporting ? '导出中…' : '导出代码包'}
        </button>
      </header>

      <div className="grid flex-1 grid-cols-[390px_1fr] grid-rows-[1fr_176px] gap-px overflow-hidden bg-zinc-200">
        {/* Left rail: timeline + summary */}
        <aside className="row-span-2 overflow-auto bg-white" data-testid="left-rail">
          <div className="border-b border-zinc-200 px-4 py-3">
            <p className="section-label">Generation Trace</p>
            <p className="mt-1 text-xs text-zinc-500">计划、文件变更、命令和测试结果</p>
          </div>
          <div className="p-3">
            <GenerationTimeline events={events} />
          </div>
          <div className="space-y-3 px-3 pb-3">
            {isCompleted && <CompletionSummary events={events} version={null} />}
            {isFailed && <ErrorPanel events={events} gen={gen} onRepair={handleRepair} />}
          </div>
        </aside>

        {/* Right: tabs */}
        <section className="overflow-hidden bg-white">
          <nav className="flex h-10 items-center gap-1 border-b border-zinc-200 px-3">
            <TabButton active={tab === 'run'} onClick={() => setTab('run')} testId="tab-run">
              {isWorkflow ? 'Workflow 运行' : 'Agent 测试台'}
            </TabButton>
            <TabButton active={tab === 'source'} onClick={() => setTab('source')} testId="tab-source">
              源码
            </TabButton>
          </nav>
          <div className={`h-[calc(100%-2.5rem)] p-4 ${tab === 'run' ? 'canvas-grid' : 'bg-white'}`}>
            {tab === 'run' ? (
              isCompleted ? (
                isWorkflow ? (
                  <WorkflowRunPanel generationId={id} />
                ) : (
                  <AgentTestPanel generationId={id} />
                )
              ) : (
                <div className="flex h-full items-center justify-center" data-testid="run-pending">
                  <div className="surface max-w-sm rounded-lg px-8 py-7 text-center">
                    <p className="text-sm font-medium text-zinc-700">
                      {status === GenerationStatus.Failed ? '生成失败' : '等待生成完成'}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {status === GenerationStatus.Failed ? '请查看左侧错误信息并尝试修复。' : '完成后可在此运行效果测试。'}
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div className="grid h-full grid-cols-[260px_1fr] overflow-hidden rounded-md border border-zinc-200">
                <div className="overflow-auto border-r border-zinc-200 bg-zinc-50/70">
                  <FileTree tree={tree} onSelect={selectFile} selectedPath={selectedPath} />
                </div>
                <CodeViewer path={selectedPath} content={content} />
              </div>
            )}
          </div>
        </section>

        {/* Bottom: output */}
        <section className="overflow-hidden bg-zinc-950">
          <OutputPanel events={events} />
        </section>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-xs font-medium transition ${
        active ? 'bg-brand text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
      }`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
