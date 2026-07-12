import { createInMemoryDb } from '../testing/in-memory-db';
import type { DatabaseService } from '../database/database.service';
import { GenerationRepository } from './repositories/generation.repository';
import { EventRepository } from './repositories/event.repository';
import { VersionRepository } from './repositories/version.repository';
import { SpecRepository } from './repositories/spec.repository';
import { EventService } from './event.service';
import { GenerationService } from './generation.service';
import { SpecParserService } from '../spec/spec-parser.service';
import { TestSpecParser } from '../testing/test-spec-parser';
import { SpecValidatorService } from '../spec/spec-validator.service';
import type { LlmSpecParser } from '../spec/llm-spec-parser';
import { expectAgentBuilderError } from '../testing/expect-error';
import {
  GenerationStatus,
  EventType,
  GenerationType,
  TestStatus,
  ErrorCode,
  type CreateGenerationRequest,
} from '@agent-builder/shared-contracts';

describe('GenerationService (Phase 9 — async parse pipeline + spec persistence)', () => {
  const dbs: DatabaseService[] = [];
  afterAll(() => {
    for (const d of dbs) d.close();
  });

  function build(llm: LlmSpecParser = new TestSpecParser()) {
    const db = createInMemoryDb();
    dbs.push(db);
    const genRepo = new GenerationRepository(db);
    const eventRepo = new EventRepository(db);
    const versionRepo = new VersionRepository(db);
    const specRepo = new SpecRepository(db);
    const eventService = new EventService(eventRepo);
    const specParser = new SpecParserService(llm);
    const specValidator = new SpecValidatorService();
    const genService = new GenerationService(
      genRepo,
      versionRepo,
      eventService,
      specParser,
      specValidator,
      specRepo,
    );
    return { db, genRepo, eventRepo, versionRepo, specRepo, eventService, genService, llm };
  }

  const TAROT_PROMPT = '一个塔罗牌占卜 Agent。首先询问用户想要占卜的问题，之后抽取塔罗牌并解读。';

  it('#1 createGeneration returns immediately in planning without parsing (HTTP not blocked)', async () => {
    const { genRepo, eventRepo, specRepo, genService } = build();
    const req: CreateGenerationRequest = {
      type: GenerationType.Agent,
      prompt: TAROT_PROMPT,
      mode: 'auto',
      model: 'default',
    };
    const gen = await genService.createGeneration(req);

    expect(gen.status).toBe(GenerationStatus.Planning);
    const events = eventRepo.listByGeneration(gen.id);
    expect(events.some((e) => e.type === EventType.PlanCreated)).toBe(true);
    // Parse has NOT happened yet — no thought event, no persisted spec, title is derived.
    expect(events.some((e) => e.type === EventType.Thought)).toBe(false);
    expect(specRepo.getByGeneration(gen.id)).toBeNull();
    expect(genRepo.getById(gen.id)!.title).not.toBe('塔罗牌占卜 Agent');
  });

  it('#2 parseAndPersistSpec parses, persists, emits thought, and updates the title', async () => {
    const { genRepo, eventRepo, specRepo, genService } = build();
    const gen = await genService.createGeneration({
      type: GenerationType.Agent,
      prompt: TAROT_PROMPT,
      mode: 'auto',
      model: 'default',
    });

    const spec = await genService.parseAndPersistSpec(gen.id);

    // All prompts go through LLM — test parser returns generic spec.
    expect(spec.name).toBe('通用智能体');
    const persisted = specRepo.getByGeneration(gen.id);
    expect(persisted).not.toBeNull();
    expect(persisted!.spec.name).toBe('通用智能体');
    expect(persisted!.parser_mode).toBe('llm');
    expect(persisted!.provider).toBe('test');
    const events = eventRepo.listByGeneration(gen.id);
    expect(events.some((e) => e.type === EventType.Thought)).toBe(true);
    expect(genRepo.getById(gen.id)!.title).toBe('通用智能体');
  });

  it('#3 parseAndPersistSpec is idempotent — does not re-invoke the parser', async () => {
    let calls = 0;
    const countingLlm: LlmSpecParser = {
      provider: 'test',
      model: null,
      parse: async (p, t) => {
        calls++;
        return new TestSpecParser().parse(p, t);
      },
    };
    const { genService } = build(countingLlm);
    const gen = await genService.createGeneration({
      type: GenerationType.Agent,
      prompt: '做一个天气查询 Agent',
      mode: 'auto',
      model: 'default',
    });

    await genService.parseAndPersistSpec(gen.id);
    expect(calls).toBe(1);
    await genService.parseAndPersistSpec(gen.id); // cached — must not re-parse
    expect(calls).toBe(1);
  });

  it('#4 getSpec reads the persisted spec and throws before parse completes', async () => {
    const { genService } = build();
    const gen = await genService.createGeneration({
      type: GenerationType.Agent,
      prompt: TAROT_PROMPT,
      mode: 'auto',
      model: 'default',
    });
    await expectAgentBuilderError(() => genService.getSpec(gen.id), ErrorCode.PromptParseFailed);
    await genService.parseAndPersistSpec(gen.id);
    // All prompts go through LLM — even tarot returns the test generic spec.
    expect(genService.getSpec(gen.id).name).toBe('通用智能体');
  });

  it('#5 a non-example prompt parses via the test parser and persists a non-tarot spec', async () => {
    const { specRepo, genService } = build();
    const gen = await genService.createGeneration({
      type: GenerationType.Agent,
      prompt: '做一个天气查询 Agent',
      mode: 'auto',
      model: 'default',
    });
    const spec = await genService.parseAndPersistSpec(gen.id);
    expect(spec.name).toBe('通用智能体');
    expect(specRepo.getByGeneration(gen.id)!.provider).toBe('test');
  });

  it('#6 all prompts (including demo keywords) go through the LLM parser', async () => {
    const { genService } = build();
    const gen = await genService.createGeneration({
      type: GenerationType.Agent,
      prompt: '做一个天气查询 Agent',
      mode: 'auto',
      model: 'default',
    });
    const spec = await genService.parseAndPersistSpec(gen.id);
    // Test parser returns generic spec — no more deterministic/demo bypass.
    expect(spec.name).toBe('通用智能体');
  });

  it('#7 a failed re-generation does NOT overwrite the previous completed version (PRD FR-012)', async () => {
    const { genRepo, eventService, genService } = build();
    const gen = await genService.createGeneration({
      type: GenerationType.Agent,
      prompt: '塔罗占卜 Agent',
      mode: 'auto',
      model: 'default',
    });
    const v1 = genService.createVersion({
      generation_id: gen.id,
      version_label: 'v1',
      summary: 'feat: 创建塔罗占卜 Agent',
      project_path: `generated/${gen.id}/v1`,
      file_count: 7,
      mock_mode: true,
    });
    await genService.promoteVersion(gen.id, { ...v1, test_status: TestStatus.Passed });
    await genService.markFailed(gen.id, 'TEST_FAILED', 'smoke test 失败');
    const current = genRepo.getById(gen.id)!;
    expect(current.status).toBe(GenerationStatus.Failed);
    expect(current.active_version_id).toBe(v1.id);
    expect(eventService.history(gen.id).filter((e) => e.type === EventType.Error)).toHaveLength(1);
  });
});
