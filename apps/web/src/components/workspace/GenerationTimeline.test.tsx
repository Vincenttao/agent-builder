import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GenerationTimeline } from './GenerationTimeline';
import type { GenerationEvent } from '@agent-builder/shared-contracts';
import { EventType } from '@agent-builder/shared-contracts';

function ev(partial: Partial<GenerationEvent>): GenerationEvent {
  return {
    id: partial.id ?? 'evt_' + Math.random(),
    generation_id: 'gen_1',
    run_id: null,
    type: partial.type ?? EventType.Thought,
    message: partial.message ?? '',
    payload: partial.payload ?? {},
    sequence: partial.sequence ?? 1,
    created_at: partial.created_at ?? '2026-07-09T00:00:00Z',
  };
}

describe('GenerationTimeline (Phase 7 §11.2 #3)', () => {
  it('shows an empty state when there are no events', () => {
    render(<GenerationTimeline events={[]} />);
    expect(screen.getByTestId('timeline-empty')).toBeInTheDocument();
  });

  it('renders plan, file, and test events inline (no label column)', () => {
    const events = [
      ev({ id: '1', sequence: 1, type: EventType.PlanCreated, message: '已创建生成计划' }),
      ev({ id: '2', sequence: 2, type: EventType.FileCreated, message: '创建文件 src/agents/agent.py', payload: { path: 'src/agents/agent.py' } }),
      ev({ id: '3', sequence: 3, type: EventType.TestStarted, message: '运行 smoke test' }),
      ev({ id: '4', sequence: 4, type: EventType.TestFinished, message: 'smoke test 通过' }),
    ];
    render(<GenerationTimeline events={events} />);
    const items = screen.getAllByTestId('event-item');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('已创建生成计划');
    expect(items[1]).toHaveTextContent('src/agents/agent.py');
    expect(items[3]).toHaveTextContent('smoke test 通过');
  });

  it('renders sandbox and opencode event types inline', () => {
    const events = [
      ev({ id: 's', sequence: 1, type: EventType.SandboxStarted, message: '沙箱启动' }),
      ev({ id: 'o', sequence: 2, type: EventType.OpencodeFileChanged, message: 'OpenCode 写入 README.md' }),
    ];
    render(<GenerationTimeline events={events} />);
    expect(screen.getAllByTestId('event-item')[0]).toHaveTextContent('沙箱启动');
    expect(screen.getAllByTestId('event-item')[1]).toHaveTextContent('OpenCode 写入 README.md');
  });
});
