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
    <div className="flex h-full flex-col bg-zinc-950" data-testid="output-panel">
      <div className="flex h-8 items-center gap-2 border-b border-white/10 px-3">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <span className="text-[11px] font-medium text-zinc-300">Runtime Output</span>
      </div>
      <div className="flex-1 overflow-auto p-3 font-mono text-[11px] leading-5 text-zinc-100">
        {logs.length === 0 ? (
          <span className="text-zinc-500">暂无运行输出</span>
        ) : (
          logs.map((e) => (
            <div key={e.id} className={e.type === EventType.Error ? 'text-red-300' : e.type === EventType.Output ? 'text-emerald-300' : 'text-zinc-200'}>
              <span className="mr-2 text-zinc-500">[{e.type}]</span>{e.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
