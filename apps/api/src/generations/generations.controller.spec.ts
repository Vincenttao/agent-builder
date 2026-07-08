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

describe('GenerationsController (Phase 1)', () => {
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

  it('POST /api/generations returns generation_id and status planning', async () => {
    const res = await request(httpServer)
      .post('/api/generations')
      .send({ type: 'agent', prompt: '塔罗占卜 Agent', mode: 'auto', model: 'default' })
      .expect(201);
    expect(res.body.generation_id).toMatch(/^gen_/);
    expect(res.body.status).toBe('planning');
  });

  it('GET /api/generations/:id returns the dto', async () => {
    const create = await request(httpServer)
      .post('/api/generations')
      .send({ type: 'workflow', prompt: '售前需求分析 Workflow' });
    const id = create.body.generation_id;
    const got = await request(httpServer).get(`/api/generations/${id}`).expect(200);
    expect(got.body.generation_id).toBe(id);
    expect(got.body.type).toBe('workflow');
  });

  it('GET /api/generations/unknown returns 404', async () => {
    await request(httpServer).get('/api/generations/gen_does_not_exist').expect(404);
  });

  it('POST rejects Skills type with 400 (P0 no Skills, PRD §4.2)', async () => {
    await request(httpServer)
      .post('/api/generations')
      .send({ type: 'skill', prompt: 'x' })
      .expect(400);
  });

  it('POST returns 400 PROMPT_PARSE_FAILED for a non-demo prompt (Phase 2 §6.4 #5)', async () => {
    const res = await request(httpServer)
      .post('/api/generations')
      .send({ type: 'agent', prompt: '做一个天气查询 Agent' })
      .expect(400);
    expect(res.body.error_code).toBe('PROMPT_PARSE_FAILED');
    expect(typeof res.body.message).toBe('string');
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

    // 1. History (plan_created) is replayed synchronously on subscribe.
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen[0].type).toBe(EventType.PlanCreated);

    // 2. A newly recorded event is streamed live.
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
});
