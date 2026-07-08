import { createInMemoryDb } from '../testing/in-memory-db';
import { EventRepository } from './repositories/event.repository';
import { EventService } from './event.service';
import { EventType, type GenerationEvent } from '@agent-builder/shared-contracts';

describe('EventService (Phase 1 §5.2 — SSE history + live)', () => {
  const db = createInMemoryDb();
  const eventRepo = new EventRepository(db);
  const service = new EventService(eventRepo);
  afterAll(() => db.close());

  it('history() returns persisted events in sequence order for replay', async () => {
    await service.record({ generation_id: 'gen_h', type: EventType.PlanCreated, message: 'plan' });
    await service.record({ generation_id: 'gen_h', type: EventType.FileCreated, message: 'f1', payload: { path: 'a.py' } });
    await service.record({ generation_id: 'gen_h', type: EventType.FileCreated, message: 'f2', payload: { path: 'b.py' } });

    const history = service.history('gen_h');
    expect(history.map((e) => e.type)).toEqual([
      EventType.PlanCreated,
      EventType.FileCreated,
      EventType.FileCreated,
    ]);
    expect(history.map((e) => e.sequence)).toEqual([1, 2, 3]);
  });

  it('subscribe() receives newly recorded events live', async () => {
    const received: GenerationEvent[] = [];
    const unsubscribe = service.subscribe('gen_live', (e) => received.push(e));

    await service.record({ generation_id: 'gen_live', type: EventType.PlanCreated, message: 'p' });
    await service.record({ generation_id: 'gen_live', type: EventType.FileCreated, message: 'f' });

    expect(received).toHaveLength(2);
    expect(received[0].type).toBe(EventType.PlanCreated);
    expect(received[1].type).toBe(EventType.FileCreated);
    expect(received[1].sequence).toBe(2);

    unsubscribe();
    await service.record({ generation_id: 'gen_live', type: EventType.FileCreated, message: 'after' });
    expect(received).toHaveLength(2); // no further events after unsubscribe
    expect(service.subscriberCount('gen_live')).toBe(0);
  });

  it('a new subscriber first replays history then receives live events', async () => {
    // pre-record one event
    await service.record({ generation_id: 'gen_resume', type: EventType.PlanCreated, message: 'old' });

    const seen: GenerationEvent[] = [];
    // SSE flow: replay history first, then subscribe live
    for (const e of service.history('gen_resume')) seen.push(e);
    const unsubscribe = service.subscribe('gen_resume', (e) => seen.push(e));

    await service.record({ generation_id: 'gen_resume', type: EventType.FileCreated, message: 'new' });

    expect(seen.map((e) => e.message)).toEqual(['old', 'new']);
    unsubscribe();
  });
});
