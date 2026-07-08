import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from '../database/database.service';
import { OrchestrationModule } from './orchestration.module';
import { OrchestratorService } from './orchestrator.service';
import { AgentBuilderExceptionFilter } from '../common/agent-builder-exception.filter';
import { createInMemoryDb } from '../testing/in-memory-db';

/**
 * POST create endpoint with the pipeline mocked out (the full pipeline is
 * exercised in the integration spec). Validates the request contract +
 * error codes (Phase 6 §10.2 #1/#2, #6 skills).
 */
describe('OrchestratorController — POST create (Phase 6 §10.2)', () => {
  let app: INestApplication;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;
  let db: DatabaseService;
  let runPipeline: jest.Mock;

  beforeAll(async () => {
    db = createInMemoryDb();
    runPipeline = jest.fn().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      imports: [OrchestrationModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(db)
      .overrideProvider(OrchestratorService)
      .useValue({ runPipeline })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AgentBuilderExceptionFilter());
    await app.init();
    httpServer = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  it('#1 creates an Agent task and returns generation_id + planning', async () => {
    const res = await request(httpServer)
      .post('/api/generations')
      .send({ type: 'agent', prompt: '塔罗占卜 Agent', mode: 'auto', model: 'default' })
      .expect(201);
    expect(res.body.generation_id).toMatch(/^gen_/);
    expect(res.body.status).toBe('planning');
    // Pipeline was scheduled (fire-and-forget) — not awaited by the request.
    expect(runPipeline).toHaveBeenCalledTimes(1);
  });

  it('#2 creates a Workflow task', async () => {
    const res = await request(httpServer)
      .post('/api/generations')
      .send({ type: 'workflow', prompt: '读取客户需求文档，生成 Demo 清单并输出报告' })
      .expect(201);
    expect(res.body.generation_id).toMatch(/^gen_/);
  });

  it('rejects Skills type with 400 (P0 no Skills, PRD §4.2)', async () => {
    await request(httpServer).post('/api/generations').send({ type: 'skill', prompt: 'x' }).expect(400);
  });

  it('returns 400 PROMPT_PARSE_FAILED for a non-demo prompt', async () => {
    const res = await request(httpServer)
      .post('/api/generations')
      .send({ type: 'agent', prompt: '做一个天气查询 Agent' })
      .expect(400);
    expect(res.body.error_code).toBe('PROMPT_PARSE_FAILED');
  });
});
