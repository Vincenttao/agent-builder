import type { GenerationEvent } from '@agent-builder/shared-contracts';
import { EventType } from '@agent-builder/shared-contracts';

const TONE: Record<string, string> = {
  [EventType.Error]: 'text-red-600',
  [EventType.TestFinished]: 'text-emerald-600',
  [EventType.Output]: 'text-emerald-600',
  [EventType.OpencodeFileChanged]: 'text-emerald-600',
};

/** Left-rail generation timeline. Thought events shown inline without label. */
export function GenerationTimeline({ events }: { events: GenerationEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-400" data-testid="timeline-empty">
        等待生成事件…
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-0.5" data-testid="timeline">
      {events.map((e) => {
        const isThought = e.type === EventType.Thought;
        return (
          <li
            key={e.id}
            data-testid="event-item"
            className={`rounded px-2 py-0.5 text-xs hover:bg-slate-100 ${
              isThought ? 'text-slate-500' : TONE[e.type] ?? 'text-slate-700'
            }`}
          >
            {isThought ? e.message : (
              <>
                <span className="mr-1.5 text-slate-400">#{e.sequence}</span>
                <span className={`font-medium ${TONE[e.type] ?? ''}`}>{e.message}</span>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
