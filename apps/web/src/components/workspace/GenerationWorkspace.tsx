'use client';

import { useEffect, useState } from 'react';
import type { GenerationDto, FileTreeNode, FileContentResponse } from '@agent-builder/shared-contracts';
import { GenerationStatus } from '@agent-builder/shared-contracts';
import { getGeneration, getFileTree, getFileContent, exportProject, exportDownloadUrl } from '@/lib/api';
import { useGenerationEvents } from '@/lib/use-generation-events';
import { GenerationTimeline } from '@/components/workspace/GenerationTimeline';
import { CompletionSummary } from '@/components/workspace/CompletionSummary';
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

/** Generation workspace (PRD §12.2). */
export function GenerationWorkspace({ id }: { id: string }) {
  const { events, status, connected, reconnecting } = useGenerationEvents(id);
  const [gen, setGen] = useState<GenerationDto | null>(null);
  const [tab, setTab] = useState<'run' | 'source'>('run');
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getGeneration(id).then(setGen).catch(() => undefined);
  }, [id]);

  // Load the file tree once files exist (generating or later).
  const showFiles = status && ![GenerationStatus.Pending, GenerationStatus.Planning, null].includes(status as never);
  useEffect(() => {
    if (showFiles && tree.length === 0) {
      getFileTree(id).then(setTree).catch(() => undefined);
    }
  }, [id, showFiles, tree.length]);

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

  const isCompleted = status === GenerationStatus.Completed;
  const isWorkflow = gen?.type === 'workflow';

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <button onClick={() => (window.location.href = '/')} className="text-sm text-slate-500 hover:underline">
            ← 首页
          </button>
          <h1 className="text-sm font-semibold text-slate-900">{gen?.title ?? '生成工作台'}</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600" data-testid="status-badge">
            {STATUS_LABEL[status ?? 'pending'] ?? status}
          </span>
          {!connected && (
            <span className="text-xs text-amber-600" data-testid="reconnect-indicator">
              {reconnecting ? '重连中…' : '已断开'}
            </span>
          )}
        </div>
        <button
          onClick={handleExport}
          disabled={!isCompleted || exporting}
          className="rounded-lg border border-brand bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          data-testid="export-button"
        >
          {exporting ? '导出中…' : '导出代码包'}
        </button>
      </header>

      <div className="grid flex-1 grid-cols-[320px_1fr] grid-rows-[1fr_180px] overflow-hidden">
        {/* Left rail: timeline + summary */}
        <aside className="row-span-2 overflow-auto border-r border-slate-200 bg-white p-3" data-testid="left-rail">
          <GenerationTimeline events={events} />
          {isCompleted && <CompletionSummary events={events} version={null} />}
        </aside>

        {/* Right: tabs */}
        <section className="overflow-hidden border-b border-slate-200 bg-white">
          <nav className="flex gap-1 border-b border-slate-200 px-2">
            <TabButton active={tab === 'run'} onClick={() => setTab('run')} testId="tab-run">
              {isWorkflow ? 'Workflow 运行' : 'Agent 测试台'}
            </TabButton>
            <TabButton active={tab === 'source'} onClick={() => setTab('source')} testId="tab-source">
              源码
            </TabButton>
          </nav>
          <div className="h-[calc(100%-2rem)] p-3">
            {tab === 'run' ? (
              isCompleted ? (
                isWorkflow ? (
                  <WorkflowRunPanel generationId={id} />
                ) : (
                  <AgentTestPanel generationId={id} />
                )
              ) : (
                <p className="text-sm text-slate-400" data-testid="run-pending">
                  {status === GenerationStatus.Failed ? '生成失败，请重新生成' : '生成完成后可在此测试…'}
                </p>
              )
            ) : (
              <div className="grid h-full grid-cols-[240px_1fr] gap-2">
                <div className="overflow-auto border-r border-slate-200">
                  <FileTree tree={tree} onSelect={selectFile} selectedPath={selectedPath} />
                </div>
                <CodeViewer path={selectedPath} content={content} />
              </div>
            )}
          </div>
        </section>

        {/* Bottom: output */}
        <section className="overflow-hidden bg-slate-900">
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
      className={`border-b-2 px-3 py-1.5 text-sm ${
        active ? 'border-brand font-medium text-brand' : 'border-transparent text-slate-500'
      }`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
