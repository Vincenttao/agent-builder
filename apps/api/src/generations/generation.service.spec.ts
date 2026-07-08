import { createInMemoryDb } from '../testing/in-memory-db';
import type { DatabaseService } from '../database/database.service';
import { GenerationRepository } from './repositories/generation.repository';
import { EventRepository } from './repositories/event.repository';
import { VersionRepository } from './repositories/version.repository';
import { EventService } from './event.service';
import { GenerationService } from './generation.service';
import { SpecParserService } from '../spec/spec-parser.service';
import { SpecValidatorService } from '../spec/spec-validator.service';
import {
  GenerationStatus,
  EventType,
  GenerationType,
  TestStatus,
  type CreateGenerationRequest,
} from '@agent-builder/shared-contracts';

describe('GenerationService (Phase 1 §5.2)', () => {
  const dbs: DatabaseService[] = [];
  afterAll(() => {
    for (const d of dbs) d.close();
  });

  function build() {
    const db = createInMemoryDb();
    dbs.push(db);
    const genRepo = new GenerationRepository(db);
    const eventRepo = new EventRepository(db);
    const versionRepo = new VersionRepository(db);
    const eventService = new EventService(eventRepo);
    const specParser = new SpecParserService();
    const specValidator = new SpecValidatorService();
    const genService = new GenerationService(genRepo, versionRepo, eventService, specParser, specValidator);
    return { db, genRepo, eventRepo, versionRepo, eventService, genService };
  }

  it('createGeneration leaves the generation in planning and emits plan_created', async () => {
    const { genRepo, eventRepo, genService } = build();

    const req: CreateGenerationRequest = {
      type: GenerationType.Agent,
      prompt: '一个塔罗牌占卜 Agent。首先询问用户想要占卜的问题，之后抽取塔罗牌并解读。',
      mode: 'auto',
      model: 'default',
    };
    const gen = await genService.createGeneration(req);

    expect(gen.id).toMatch(/^gen_/);
    // Phase 1 §5.2 test #1: after create, status is pending or planning.
    expect([GenerationStatus.Pending, GenerationStatus.Planning]).toContain(gen.status);
    expect(gen.status).toBe(GenerationStatus.Planning);

    // DB has the generation record (checkpoint #2).
    const persisted = genRepo.getById(gen.id);
    expect(persisted).not.toBeNull();
    expect(persisted!.user_prompt).toBe(req.prompt);

    // SSE can receive the plan_created event (checkpoint #3).
    const events = eventRepo.listByGeneration(gen.id);
    expect(events.some((e) => e.type === EventType.PlanCreated)).toBe(true);

    // Phase 2: deterministic parse wired into createGeneration — title is taken
    // from the parsed Spec name, and a Thought (spec_parsed) event is emitted.
    const refreshed = genRepo.getById(gen.id);
    expect(refreshed!.title).toBe('塔罗牌占卜 Agent');
    expect(events.some((e) => e.type === EventType.Thought)).toBe(true);
  });

  it('a failed re-generation does NOT overwrite the previous completed version (PRD FR-012 / architecture §5.2)', async () => {
    const { genRepo, eventService, genService } = build();

    const gen = await genService.createGeneration({
      type: GenerationType.Agent,
      prompt: '塔罗占卜 Agent',
      mode: 'auto',
      model: 'default',
    });

    // First generation succeeds → version v1 promoted, status completed.
    const v1 = genService.createVersion({
      generation_id: gen.id,
      version_label: 'v1',
      summary: 'feat: 创建塔罗占卜 Agent',
      project_path: `generated/${gen.id}/v1`,
      file_count: 7,
      mock_mode: true,
    });
    await genService.promoteVersion(gen.id, { ...v1, test_status: TestStatus.Passed });

    let current = genRepo.getById(gen.id)!;
    expect(current.status).toBe(GenerationStatus.Completed);
    expect(current.active_version_id).toBe(v1.id);

    // Second attempt fails. active_version_id must remain v1.
    await genService.markFailed(gen.id, 'TEST_FAILED', 'smoke test 失败');

    current = genRepo.getById(gen.id)!;
    expect(current.status).toBe(GenerationStatus.Failed);
    expect(current.active_version_id).toBe(v1.id); // NOT overwritten
    expect(current.error_code).toBe('TEST_FAILED');

    // The active version is still v1 (getActiveVersion reads active_version_id).
    expect(genService.getActiveVersion(gen.id)?.id).toBe(v1.id);

    // An error event was emitted.
    const errEvents = eventService.history(gen.id).filter((e) => e.type === EventType.Error);
    expect(errEvents).toHaveLength(1);
  });
});
