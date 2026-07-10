import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseService } from '../database/database.service';
import { OrchestrationModule } from './orchestration.module';
import { OrchestratorService } from './orchestrator.service';
import { GenerationService } from '../generations/generation.service';
import { AgentBuilderExceptionFilter } from '../common/agent-builder-exception.filter';
import { createInMemoryDb } from '../testing/in-memory-db';
import { GenerationType } from '@agent-builder/shared-contracts';
import { GENERATED_DIR } from '../common/workspace';

/**
 * Full backend integration (Phase 6 §10.4): POST -> pipeline (generate + smoke
 * test) -> completed -> files -> content -> run -> export. Exercises the real
 * TemplateEngine, SandboxService (mock) and Python Runner end-to-end.
 */
describe('Orchestration integration (Phase 6 §10.4)', () => {
  let app: INestApplication;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;
  let db: DatabaseService;
  let orchestrator: OrchestratorService;
  let genService: GenerationService;
  const createdGenDirs: string[] = [];

  beforeAll(async () => {
    db = createInMemoryDb();
    const moduleRef = await Test.createTestingModule({ imports: [OrchestrationModule] })
      .overrideProvider(DatabaseService)
      .useValue(db)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AgentBuilderExceptionFilter());
    await app.init();
    httpServer = app.getHttpServer();
    orchestrator = moduleRef.get(OrchestratorService);
    genService = moduleRef.get(GenerationService);
  });

  afterAll(async () => {
    await app.close();
    db.close();
    for (const dir of createdGenDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  async function createAndWait(prompt: string, type: 'agent' | 'workflow'): Promise<string> {
    const gen = await genService.createGeneration({
      type: type === 'agent' ? GenerationType.Agent : GenerationType.Workflow,
      prompt,
      mode: 'auto',
      model: 'default',
    });
    createdGenDirs.push(path.join(GENERATED_DIR, gen.id));
    await orchestrator.runPipeline(gen.id); // await completion directly (no fire-and-forget race)
    const final = genService.getById(gen.id);
    expect(final?.status).toBe('completed');
    return gen.id;
  }

  it('#1 fully generates the tarot Agent (#1, #5, #7, #8, #9)', async () => {
    const id = await createAndWait('塔罗占卜 Agent', 'agent');

    // #5 file tree
    const tree = (await request(httpServer).get(`/api/generations/${id}/files`).expect(200)).body;
    const flat = JSON.stringify(tree);
    expect(flat).toContain('src/agents/agent.py');
    expect(flat).toContain('tests/test_agent_smoke.py');

    // #6 file content (path-safe)
    const content = await request(httpServer)
      .get(`/api/generations/${id}/files/content?path=src/agents/agent.py`)
      .expect(200);
    expect(content.body.content).toContain('build_agent');

    // #7 agent run returns a mock reply
    const run = await request(httpServer)
      .post(`/api/generations/${id}/agent/runs`)
      .send({ message: '我想看看最近职业发展的趋势' })
      .expect(201);
    expect(run.body.mock).toBe(true);
    expect(run.body.status).toBe('success');
    expect(run.body.output.reply).toBeTruthy();
    expect(run.body.events.length).toBeGreaterThan(0); // tool call recorded

    // #9 export — zip must not contain .env / secrets
    const exp = await request(httpServer).post(`/api/generations/${id}/exports`).expect(201);
    expect(exp.body.export_id).toMatch(/^exp_/);
    const dl = await request(httpServer)
      .get(`/api/exports/${exp.body.export_id}/download`)
      .expect(200)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    const zipBuffer = dl.body as Buffer;
    expect(zipBuffer.length).toBeGreaterThan(0);
    expect(zipBuffer.slice(0, 2).toString('latin1')).toBe('PK'); // zip magic
    expect(zipBuffer.toString('latin1')).toContain('agent.py'); // source included
    expect(zipBuffer.toString('latin1')).not.toContain('OPENJIUWEN_API_KEY=sk-');
  });

  it('#2 fully generates a Workflow (#2, #8 workflow run)', async () => {
    const id = await createAndWait(
      '读取客户需求文档，抽取客户目标和限制条件，匹配可演示的解决方案，生成 Demo 清单并输出一份 Markdown 报告。',
      'workflow',
    );

    const tree = (await request(httpServer).get(`/api/generations/${id}/files`).expect(200)).body;
    // Generic workflow also produces standard files.
    expect(JSON.stringify(tree)).toContain('workflow.yaml');

    const run = await request(httpServer)
      .post(`/api/generations/${id}/workflow/runs`)
      .send({ inputs: { requirement_doc: '客户希望智能客服 Demo，两周内上线。' } })
      .expect(201);
    expect(run.body.mock).toBe(true);
    expect(run.body.status).toBe('success');
    // All prompts go through LLM — generic workflow output, not presales-specific.
    expect(run.body.output).toBeTruthy();
    expect(run.body.events.length).toBeGreaterThan(0); // node run records

    const exp = await request(httpServer).post(`/api/generations/${id}/exports`).expect(201);
    await request(httpServer).get(`/api/exports/${exp.body.export_id}/download`).expect(200);
  });

  it('#3 path traversal is blocked (../../etc/passwd)', async () => {
    const id = await createAndWait('塔罗占卜 Agent', 'agent');
    await request(httpServer)
      .get(`/api/generations/${id}/files/content?path=../../etc/passwd`)
      .expect(400);
  });

  it('#4 non-example Agent prompt parses via the mock LLM and completes (Phase 11)', async () => {
    const id = await createAndWait('做一个天气查询 Agent，根据城市返回天气信息', 'agent');
    // The parsed Spec is persisted and read back without re-parsing (§9 test #9).
    const spec = genService.getSpec(id);
    expect(spec.name).toBe('通用智能体'); // mock LLM generic spec, not the tarot demo
    // Source files present.
    const tree = (await request(httpServer).get(`/api/generations/${id}/files`).expect(200)).body;
    expect(JSON.stringify(tree)).toContain('src/agents/agent.py');
    // Agent run reply names the generic tool, never tarot language (§12 §1 #6).
    const run = await request(httpServer)
      .post(`/api/generations/${id}/agent/runs`)
      .send({ message: '北京今天天气' })
      .expect(201);
    expect(run.body.output.reply).toContain('query_info');
    expect(run.body.output.reply).not.toContain('牌');
  });

  it('#5 non-example Workflow prompt parses via the mock LLM and completes (Phase 11)', async () => {
    const id = await createAndWait('合同审核流程，抽取关键条款并标注风险等级', 'workflow');
    const spec = genService.getSpec(id);
    expect(spec.name).toBe('通用处理工作流');
    const run = await request(httpServer)
      .post(`/api/generations/${id}/workflow/runs`)
      .send({ inputs: { requirement_doc: '一份合同文档示例。' } })
      .expect(201);
    expect(run.body.status).toBe('success');
    expect(run.body.events.length).toBeGreaterThan(0);
  });

  // D-012: repair flow
  it('#6 repair creates a new version and re-runs the pipeline', async () => {
    const id = await createAndWait('塔罗占卜 Agent', 'agent');
    const before = genService.getByIdOrThrow(id);
    expect(before.status).toBe('completed');

    const repair = await request(httpServer)
      .post(`/api/generations/${id}/repair`)
      .send({ instruction: '需要修复' })
      .expect(201);
    expect(repair.body.generation_id).toBe(id);
    expect(repair.body.version_label).toBe('v2');
    expect(repair.body.retry_index).toBe(1);

    // Wait for the repair pipeline to complete.
    let final: { status: string; active_version_id: string | null } | null = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const g = genService.getByIdOrThrow(id);
      if (g.status === 'completed' || g.status === 'failed') {
        final = { status: g.status, active_version_id: g.active_version_id };
        break;
      }
    }
    expect(final).not.toBeNull();
    expect(final!.status).toBe('completed');
    // The active version should have been updated to the repair version.
    expect(final!.active_version_id).not.toBe(before.active_version_id);
  });
});
