import {
  EventType,
  PRD_LIFECYCLE_EVENTS,
  createGenerationRequestSchema,
  GenerationType,
} from './index';

describe('EventType', () => {
  it('exposes all 12 PRD FR-005 lifecycle events', () => {
    expect(PRD_LIFECYCLE_EVENTS).toHaveLength(12);
    expect(PRD_LIFECYCLE_EVENTS).toContain(EventType.PlanCreated);
    expect(PRD_LIFECYCLE_EVENTS).toContain(EventType.FileCreated);
    expect(PRD_LIFECYCLE_EVENTS).toContain(EventType.TestFinished);
    expect(PRD_LIFECYCLE_EVENTS).toContain(EventType.Error);
  });

  it('uses stable string values', () => {
    expect(EventType.PlanCreated).toBe('plan_created');
    expect(EventType.FileCreated).toBe('file_created');
    expect(EventType.CommandFinished).toBe('command_finished');
    expect(EventType.OpencodeStarted).toBe('opencode_started');
    expect(EventType.SandboxStarted).toBe('sandbox_started');
  });
});

describe('createGenerationRequestSchema (PRD §11.1 / FR-001)', () => {
  it('accepts a valid agent request', () => {
    const parsed = createGenerationRequestSchema.parse({
      type: 'agent',
      prompt: '一个塔罗牌占卜 Agent。',
      mode: 'auto',
      model: 'default',
    });
    expect(parsed.type).toBe(GenerationType.Agent);
    expect(parsed.mode).toBe('auto');
  });

  it('applies defaults for mode and model', () => {
    const parsed = createGenerationRequestSchema.parse({
      type: 'workflow',
      prompt: '读取客户需求…',
    });
    expect(parsed.mode).toBe('auto');
    expect(parsed.model).toBe('default');
  });

  it('rejects empty prompt', () => {
    expect(() =>
      createGenerationRequestSchema.parse({ type: 'agent', prompt: '' }),
    ).toThrow();
  });

  it('rejects Skills (P0 has no Skills creation, PRD §4.2)', () => {
    expect(() =>
      createGenerationRequestSchema.parse({ type: 'skill', prompt: 'x' }),
    ).toThrow();
  });
});
