import { createInMemoryDb } from '../../testing/in-memory-db';
import { EventRepository } from './event.repository';

describe('EventRepository (Phase 1 §5.2 — sequence increment)', () => {
  const db = createInMemoryDb();
  const repo = new EventRepository(db);
  afterAll(() => db.close());

  it('assigns monotonically increasing sequence per generation', () => {
    const e1 = repo.insert({ generation_id: 'gen_a', type: 'plan_created', message: 'm1' });
    const e2 = repo.insert({ generation_id: 'gen_a', type: 'file_created', message: 'm2' });
    const e3 = repo.insert({ generation_id: 'gen_a', type: 'file_created', message: 'm3' });
    expect(e1.sequence).toBe(1);
    expect(e2.sequence).toBe(2);
    expect(e3.sequence).toBe(3);
  });

  it('keeps sequences independent per generation', () => {
    const e = repo.insert({ generation_id: 'gen_b', type: 'plan_created', message: 'm' });
    expect(e.sequence).toBe(1);
  });

  it('lists events in stable sequence order after a cursor', () => {
    repo.insert({ generation_id: 'gen_c', type: 'plan_created', message: '1' });
    repo.insert({ generation_id: 'gen_c', type: 'file_created', message: '2' });
    const e3 = repo.insert({ generation_id: 'gen_c', type: 'file_created', message: '3' });
    const list = repo.listByGeneration('gen_c', 1);
    expect(list).toHaveLength(2);
    expect(list.map((e) => e.sequence)).toEqual([2, 3]);
    expect(list[1].id).toBe(e3.id);
  });

  it('replays full history with afterSequence=0', () => {
    const list = repo.listByGeneration('gen_a', 0);
    expect(list.map((e) => e.sequence)).toEqual([1, 2, 3]);
  });

  it('persists payload as JSON and round-trips it', () => {
    const e = repo.insert({
      generation_id: 'gen_d',
      type: 'file_created',
      message: 'm',
      payload: { path: 'src/x.py', lines: 42, nested: { ok: true } },
    });
    const fetched = repo.listByGeneration('gen_d')[0];
    expect(fetched.payload).toEqual({ path: 'src/x.py', lines: 42, nested: { ok: true } });
    expect(e.id).toBe(fetched.id);
  });
});
