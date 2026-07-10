import type { GenerationEvent } from '@agent-builder/shared-contracts';
import { EventType } from '@agent-builder/shared-contracts';

const TONE: Record<string, string> = {
  [EventType.Error]: 'border-red-200 bg-red-50 text-red-700',
  [EventType.TestFinished]: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  [EventType.Output]: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  [EventType.OpencodeFileChanged]: 'border-teal-200 bg-teal-50 text-teal-700',
};

/** Map event types to phases for grouping (D-024). */
const PHASE_LABELS: { label: string; match: (e: GenerationEvent) => boolean }[] = [
  { label: '理解需求', match: (e) =>
    e.type === EventType.PlanCreated || e.type === EventType.Thought ||
    e.type === EventType.OpencodeStarted,
  },
  { label: '生成代码', match: (e) =>
    e.type === EventType.CommandStarted || e.type === EventType.CommandFinished ||
    e.type === EventType.FileCreated || e.type === EventType.FileUpdated ||
    e.type === EventType.OpencodeFileChanged || e.type === EventType.OpencodeFinished,
  },
  { label: '运行测试', match: (e) =>
    e.type === EventType.TestStarted || e.type === EventType.TestFinished ||
    e.type === EventType.SandboxStarted || e.type === EventType.SandboxFinished,
  },
  { label: '完成交付', match: (e) =>
    e.type === EventType.Output || e.type === EventType.Error ||
    e.type === EventType.RunStarted || e.type === EventType.RunFinished,
  },
];

function phaseFor(e: GenerationEvent): string | null {
  for (const p of PHASE_LABELS) {
    if (p.match(e)) return p.label;
  }
  return null;
}

/** Left-rail generation timeline with phase group headers (D-024). */
export function GenerationTimeline({ events }: { events: GenerationEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-zinc-400" data-testid="timeline-empty">
        等待生成事件…
      </p>
    );
  }

  let lastPhase = '';
  return (
    <ol className="flex flex-col gap-1.5" data-testid="timeline">
      {events.map((e) => {
        const phase = phaseFor(e);
        const showPhase = phase && phase !== lastPhase;
        if (showPhase) lastPhase = phase;
        const isThought = e.type === EventType.Thought;
        return (
          <li key={e.id}>
            {showPhase && (
              <div className="mb-1.5 mt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                {phase}
              </div>
            )}
            <div
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
            </div>
          </li>
        );
      })}
    </ol>
  );
}
