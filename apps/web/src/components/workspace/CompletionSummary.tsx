import type { GenerationEvent } from '@agent-builder/shared-contracts';
import { EventType, type ProjectVersion } from '@agent-builder/shared-contracts';

/** Completion summary card (PRD §5.2 example A, FR-011). Derives from events. */
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

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="completion-summary"
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">✅</span>
        <h3 className="text-sm font-semibold text-slate-900">生成完成摘要</h3>
      </div>
      <p className="mt-2 text-sm text-slate-700" data-testid="summary-text">
        {output?.message ?? '生成已完成'}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
        <dt>测试结果</dt>
        <dd data-testid="test-result" className={passed ? 'text-emerald-600' : 'text-red-600'}>
          {passed ? '通过' : '失败'}
        </dd>
        <dt>文件数量</dt>
        <dd data-testid="file-count">{fileCount}</dd>
        {version && (
          <>
            <dt>版本</dt>
            <dd>{version.version_label}</dd>
            <dt>运行模式</dt>
            <dd>{version.mock_mode ? 'mock' : 'real'}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
