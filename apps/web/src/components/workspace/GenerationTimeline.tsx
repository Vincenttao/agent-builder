import type { GenerationEvent } from '@agent-builder/shared-contracts';
import { EventType } from '@agent-builder/shared-contracts';

const TONE: Record<string, string> = {
  [EventType.Error]: 'border-red-200 bg-red-50 text-red-700',
  [EventType.TestFinished]: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  [EventType.Output]: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  [EventType.OpencodeFileChanged]: 'border-teal-200 bg-teal-50 text-teal-700',
};

/** Left-rail generation timeline. Thought events shown inline without label. */
export function GenerationTimeline({ events }: { events: GenerationEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-zinc-400" data-testid="timeline-empty">
        等待生成事件…
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-1.5" data-testid="timeline">
      {events.map((e) => {
        const isThought = e.type === EventType.Thought;
        return (
          <li
            key={e.id}
            data-testid="event-item"
            className={`rounded-md border px-2.5 py-2 text-xs leading-5 ${
              isThought ? 'border-transparent bg-transparent text-zinc-500' : TONE[e.type] ?? 'border-zinc-200 bg-white text-zinc-700'
            }`}
          >
            {isThought ? e.message : (
              <div className="flex gap-2">
                <span className="mt-0.5 font-mono text-[10px] text-zinc-400">#{String(e.sequence).padStart(2, '0')}</span>
                <span className="font-medium">{e.message}</span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
