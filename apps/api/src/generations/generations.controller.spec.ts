import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from '../database/database.service';
import { GenerationsModule } from './generations.module';
import { GenerationsController } from './generations.controller';
import { EventService } from './event.service';
import { GenerationService } from './generation.service';
import { AgentBuilderExceptionFilter } from '../common/agent-builder-exception.filter';
import { createInMemoryDb } from '../testing/in-memory-db';
import { EventType, GenerationType } from '@agent-builder/shared-contracts';

describe('GenerationsController (Phase 1+6 — GET + SSE)', () => {
  let app: INestApplication;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;
  let db: DatabaseService;
  let controller: GenerationsController;
  let eventService: EventService;
  let genService: GenerationService;

  beforeAll(async () => {
    db = createInMemoryDb();
    const moduleRef = await Test.createTestingModule({
      imports: [GenerationsModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(db)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AgentBuilderExceptionFilter());
    await app.init();
    httpServer = app.getHttpServer();
    controller = moduleRef.get(GenerationsController);
    eventService = moduleRef.get(EventService);
    genService = moduleRef.get(GenerationService);
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  it('GET /api/generations/:id returns the dto', async () => {
    const gen = await genService.createGeneration({
      type: GenerationType.Workflow,
      prompt: '售前需求分析 Workflow',
      mode: 'auto',
      model: 'default',
    });
    const got = await request(httpServer).get(`/api/generations/${gen.id}`).expect(200);
    expect(got.body.generation_id).toBe(gen.id);
    expect(got.body.type).toBe('workflow');
  });

  it('GET /api/generations/unknown returns 404', async () => {
    await request(httpServer).get('/api/generations/gen_does_not_exist').expect(404);
  });

  it('SSE observable replays history then streams live events', async () => {
    const gen = await genService.createGeneration({
      type: GenerationType.Agent,
      prompt: '塔罗占卜 Agent',
      mode: 'auto',
      model: 'default',
    });
    const seen: MessageEvent[] = [];
    const sub = controller.events(gen.id).subscribe((m) => seen.push(m));

    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen[0].type).toBe(EventType.PlanCreated);

    await eventService.record({
      generation_id: gen.id,
      type: EventType.FileCreated,
      message: '创建文件 src/agents/agent.py',
      payload: { path: 'src/agents/agent.py' },
    });
    await new Promise((r) => setImmediate(r));
    expect(seen.some((m) => m.type === EventType.FileCreated)).toBe(true);

    sub.unsubscribe();
  });

  it('GET /api/generations/:id/events/history returns persisted events after a cursor', async () => {
    const gen = await genService.createGeneration({
      type: GenerationType.Agent,
      prompt: '会议纪要 Agent',
      mode: 'auto',
      model: 'default',
    });
    await eventService.record({
      generation_id: gen.id,
      type: EventType.Thought,
      message: '开始分析',
      payload: {},
    });

    const all = await request(httpServer)
      .get(`/api/generations/${gen.id}/events/history`)
      .expect(200);
    expect(all.body.map((e: { sequence: number }) => e.sequence)).toEqual([1, 2]);

    const after = await request(httpServer)
      .get(`/api/generations/${gen.id}/events/history?after=1`)
      .expect(200);
    expect(after.body).toHaveLength(1);
    expect(after.body[0].message).toBe('开始分析');
  });
});
