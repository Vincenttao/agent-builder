import type { GenerationEvent } from '@agent-builder/shared-contracts';
import { EventType, type ProjectVersion } from '@agent-builder/shared-contracts';

/** Completion summary card (PRD §5.2 example A, FR-011). Derives from events.
 * Phase 12 §1 #3: surfaces parser mode, codegen engine, and fallback state. */
export function CompletionSummary({
  events,
  version,
}: {
  events: GenerationEvent[];
  version: ProjectVersion | null;
}) {
  const testFinished = events.find((e) => e.type === EventType.TestFinished);
  const passed = testFinished?.payload?.passed === true;
  const output = events.find((e) => e.type === EventType.Output);
  const fileCount = version?.file_count ?? events.filter((e) => e.type === EventType.FileCreated).length;

  const thought = events.find((e) => e.type === EventType.Thought);
  const cmdFinished = events.find((e) => e.type === EventType.CommandFinished);
  const parserMode = (thought?.payload?.parser_mode as string | undefined) ?? null;
  const provider = (thought?.payload?.provider as string | undefined) ?? null;
  const engine = (cmdFinished?.payload?.engine as string | undefined) ?? null;
  const fallback = cmdFinished?.payload?.fallback === true;

  return (
    <div
      className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4"
      data-testid="completion-summary"
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <h3 className="text-xs font-semibold text-emerald-950">生成完成摘要</h3>
      </div>
      <p className="mt-2 text-xs leading-5 text-emerald-900" data-testid="summary-text">
        {output?.message ?? '生成已完成'}
      </p>
      <dl className="mt-3 grid grid-cols-[92px_1fr] gap-x-3 gap-y-1.5 text-[11px]">
        <dt className="text-emerald-700">测试结果</dt>
        <dd data-testid="test-result" className={passed ? 'font-medium text-emerald-800' : 'font-medium text-red-700'}>
          {passed ? '通过' : '失败'}
        </dd>
        <dt className="text-emerald-700">文件数量</dt>
        <dd data-testid="file-count" className="text-emerald-950">{fileCount}</dd>
        <dt className="text-emerald-700">解析方式</dt>
        <dd data-testid="parser-mode" className="text-emerald-950">{parserMode ?? '-'}</dd>
        <dt className="text-emerald-700">代码引擎</dt>
        <dd data-testid="codegen-engine" className="text-emerald-950">
          {engine ?? '—'}
          {fallback && <span className="ml-1 text-amber-600">（已回退）</span>}
        </dd>
        {provider && (
          <>
            <dt className="text-emerald-700">Spec 来源</dt>
            <dd className="text-emerald-950">{provider}</dd>
          </>
        )}
        {version && (
          <>
            <dt className="text-emerald-700">版本</dt>
            <dd className="text-emerald-950">{version.version_label}</dd>
            <dt className="text-emerald-700">运行模式</dt>
            <dd className="text-emerald-950">{version.mock_mode ? 'mock' : 'real'}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
