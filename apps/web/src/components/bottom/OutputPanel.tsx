import type { GenerationEvent } from '@agent-builder/shared-contracts';
import { EventType } from '@agent-builder/shared-contracts';

const LOG_TYPES = new Set<string>([
  EventType.CommandStarted,
  EventType.CommandFinished,
  EventType.SandboxStarted,
  EventType.SandboxFinished,
  EventType.TestStarted,
  EventType.TestFinished,
  EventType.Output,
  EventType.Error,
]);

/** Bottom output panel (PRD §12.2 bottom: terminal / run log / output). */
export function OutputPanel({ events }: { events: GenerationEvent[] }) {
  const logs = events.filter((e) => LOG_TYPES.has(e.type));
  return (
    <div className="h-full overflow-auto bg-slate-900 p-2 font-mono text-xs text-slate-100" data-testid="output-panel">
      {logs.length === 0 ? (
        <span className="text-slate-500">暂无运行输出</span>
      ) : (
        logs.map((e) => (
          <div key={e.id} className={e.type === EventType.Error ? 'text-red-400' : e.type === EventType.Output ? 'text-emerald-300' : ''}>
            <span className="text-slate-500">[{e.type}]</span> {e.message}
          </div>
        ))
      )}
    </div>
  );
}
