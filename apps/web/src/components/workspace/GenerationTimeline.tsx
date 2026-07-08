import type { GenerationEvent } from '@agent-builder/shared-contracts';
import { EventType } from '@agent-builder/shared-contracts';

const LABELS: Record<string, string> = {
  [EventType.Thought]: '思考',
  [EventType.PlanCreated]: '计划',
  [EventType.PlanUpdated]: '计划更新',
  [EventType.FileCreated]: '文件创建',
  [EventType.FileUpdated]: '文件更新',
  [EventType.CommandStarted]: '命令开始',
  [EventType.CommandFinished]: '命令完成',
  [EventType.TestStarted]: '测试开始',
  [EventType.TestFinished]: '测试完成',
  [EventType.RunStarted]: '运行开始',
  [EventType.RunFinished]: '运行完成',
  [EventType.SandboxStarted]: '沙箱启动',
  [EventType.SandboxFinished]: '沙箱结束',
  [EventType.OpencodeStarted]: 'OpenCode 启动',
  [EventType.OpencodeFileChanged]: 'OpenCode 写文件',
  [EventType.OpencodeFinished]: 'OpenCode 结束',
  [EventType.NodeStarted]: '节点开始',
  [EventType.NodeFinished]: '节点结束',
  [EventType.Output]: '输出',
  [EventType.Error]: '错误',
};

const TONE: Record<string, string> = {
  [EventType.Error]: 'text-red-600',
  [EventType.TestFinished]: 'text-emerald-600',
  [EventType.Output]: 'text-emerald-600',
};

/** Left-rail generation timeline (PRD FR-005, §12.2). Presentational. */
export function GenerationTimeline({ events }: { events: GenerationEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-400" data-testid="timeline-empty">
        等待生成事件…
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-1" data-testid="timeline">
      {events.map((e) => {
        const path = (e.payload?.path as string | undefined) ?? undefined;
        return (
          <li
            key={e.id}
            data-testid="event-item"
            className="flex items-start gap-2 rounded px-2 py-1 text-sm hover:bg-slate-100"
          >
            <span className="w-16 shrink-0 text-xs text-slate-400">#{e.sequence}</span>
            <span className="w-20 shrink-0 text-xs font-medium text-brand">
              {LABELS[e.type] ?? e.type}
            </span>
            <span className={`flex-1 ${TONE[e.type] ?? 'text-slate-700'}`}>
              {e.message}
              {path && <code className="ml-1 text-xs text-slate-500">{path}</code>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
