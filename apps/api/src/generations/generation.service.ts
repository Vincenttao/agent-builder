import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { GenerationRepository } from './repositories/generation.repository';
import { VersionRepository } from './repositories/version.repository';
import { SpecRepository } from './repositories/spec.repository';
import { EventService } from './event.service';
import { SpecParserService } from '../spec/spec-parser.service';
import { SpecValidatorService } from '../spec/spec-validator.service';
import type {
  CreateGenerationRequest,
  Generation,
  ProjectVersion,
  AgentSpec,
  WorkflowSpec,
} from '@agent-builder/shared-contracts';
import {
  GenerationStatus,
  EventType,
  TestStatus,
  AgentBuilderError,
  ErrorCode,
  canTransition,
} from '@agent-builder/shared-contracts';

/**
 * Orchestrates a generation's lifecycle (architecture §5.2).
 *
 * Phase 9: createGeneration is now non-blocking — it inserts the generation,
 * emits plan_created, and returns immediately. The LLM parse (which can take
 * 5-45s) runs in the async pipeline via parseAndPersistSpec, never on the HTTP
 * path (plan §2.3 item A / §9 implementation task 7). The parsed Spec is
 * persisted to generation_specs so getSpec never re-invokes the LLM (§9 note 1).
 */
@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly genRepo: GenerationRepository,
    private readonly versionRepo: VersionRepository,
    private readonly eventService: EventService,
    private readonly specParser: SpecParserService,
    private readonly specValidator: SpecValidatorService,
    private readonly specRepo: SpecRepository,
  ) {}

  async createGeneration(req: CreateGenerationRequest): Promise<Generation> {
    const id = this.genRepo.newId();
    const title = this.deriveTitle(req.prompt, req.type);
    this.genRepo.insert({
      id,
      type: req.type,
      title,
      user_prompt: req.prompt,
      status: GenerationStatus.Pending,
      selected_model: req.model ?? 'default',
      mode: req.mode,
    });

    // pending -> planning: emit a plan event and advance state. Parse happens
    // later in the async pipeline — the HTTP request returns here (§9 task 7).
    await this.eventService.record({
      generation_id: id,
      type: EventType.PlanCreated,
      message: `已创建生成计划：${title}`,
      payload: { type: req.type, title, model: req.model ?? 'default' },
    });
    this.genRepo.updateStatus(id, GenerationStatus.Planning);

    return this.genRepo.getById(id)!;
  }

  /**
   * Parse the prompt into a Spec, validate it, and persist it. Idempotent: if a
   * Spec is already persisted for this generation it is returned without
   * re-invoking the parser (§9 test #9 — a real LLM must not be re-called).
   * Emits a thought event carrying the validated Spec and updates the title.
   */
  async parseAndPersistSpec(id: string): Promise<AgentSpec | WorkflowSpec> {
    const existing = this.specRepo.getByGeneration(id);
    if (existing) return existing.spec;

    const gen = this.genRepo.getById(id);
    if (!gen) {
      throw new AgentBuilderError(ErrorCode.PromptParseFailed, `生成任务 ${id} 不存在`);
    }

    const result = await this.specParser.parse(gen.user_prompt, gen.type);
    const validated = this.specValidator.validate(result.spec) as AgentSpec | WorkflowSpec;
    const specName = 'name' in validated ? validated.name : gen.title;

    this.specRepo.save({
      generation_id: id,
      spec: validated,
      parser_mode: result.parserMode,
      provider: result.provider,
      model: result.model,
      prompt_hash: createHash('sha256').update(gen.user_prompt).digest('hex').slice(0, 16),
      validation_status: 'valid',
    });

    this.genRepo.updateTitle(id, specName);
    await this.eventService.record({
      generation_id: id,
      type: EventType.Thought,
      message: `需求已解析为 Spec：${specName}`,
      payload: {
        spec: validated as unknown as Record<string, unknown>,
        parser_mode: result.parserMode,
        provider: result.provider,
        model: result.model,
      },
    });
    return validated;
  }

  getById(id: string): Generation | null {
    return this.genRepo.getById(id);
  }

  /** Read the persisted Spec for a generation (never re-parses). Throws if the
   * async parse has not completed yet — callers should use parseAndPersistSpec
   * to drive the parse, then this read path is consistent (§9 note 1). */
  getSpec(id: string): AgentSpec | WorkflowSpec {
    const gen = this.genRepo.getById(id);
    if (!gen) {
      throw new AgentBuilderError(ErrorCode.PromptParseFailed, `生成任务 ${id} 不存在`);
    }
    const persisted = this.specRepo.getByGeneration(id);
    if (!persisted) {
      throw new AgentBuilderError(
        ErrorCode.PromptParseFailed,
        `生成任务 ${id} 的 Spec 尚未解析完成`,
      );
    }
    return persisted.spec;
  }

  /** Lifecycle transition used by the orchestrator (architecture §11). */
  transitionTo(id: string, status: GenerationStatus): void {
    const gen = this.genRepo.getById(id);
    if (!gen) return;
    if (canTransition(gen.status as GenerationStatus, status)) {
      this.genRepo.updateStatus(id, status);
    }
  }

  /**
   * Promote a version to active and mark the generation completed.
   * Called only after smoke test passes (Phase 6).
   */
  async promoteVersion(
    generationId: string,
    version: ProjectVersion,
  ): Promise<void> {
    this.genRepo.setActiveVersion(generationId, version.id, version.project_path);
    this.genRepo.markCompleted(generationId);
    await this.eventService.record({
      generation_id: generationId,
      type: EventType.TestFinished,
      message: `测试通过，已发布版本 ${version.version_label}`,
      payload: { version_id: version.id, file_count: version.file_count, mock: version.mock_mode },
    });
  }

  /**
   * Mark a generation failed WITHOUT touching active_version_id — a failed
   * re-generation must never overwrite the last successful version
   * (PRD FR-012 / architecture §5.2).
   */
  async markFailed(
    generationId: string,
    errorCode: string,
    errorMessage: string,
    runId?: string | null,
  ): Promise<void> {
    this.genRepo.markFailed(generationId, errorCode, errorMessage);
    await this.eventService.record({
      generation_id: generationId,
      type: EventType.Error,
      message: errorMessage,
      payload: { error_code: errorCode },
      run_id: runId ?? null,
    });
    this.logger.warn(`Generation ${generationId} failed: ${errorCode} — ${errorMessage}`);
  }

  /** Create a version row (Phase 6 uses this after files are written). */
  createVersion(input: {
    generation_id: string;
    version_label: string;
    summary: string;
    project_path: string;
    file_count: number;
    mock_mode: boolean;
  }): ProjectVersion {
    return this.versionRepo.create({
      id: this.versionRepo.newId(),
      generation_id: input.generation_id,
      version_label: input.version_label,
      summary: input.summary,
      project_path: input.project_path,
      file_count: input.file_count,
      test_status: TestStatus.Skipped,
      mock_mode: input.mock_mode,
    });
  }

  /** The last successfully-completed version (null if none). */
  getActiveVersion(generationId: string): ProjectVersion | null {
    const gen = this.genRepo.getById(generationId);
    if (!gen?.active_version_id) return null;
    return this.versionRepo.getById(gen.active_version_id);
  }

  private deriveTitle(prompt: string, type: string): string {
    const trimmed = prompt.trim().replace(/\s+/g, ' ');
    const suffix = type === 'workflow' ? 'Workflow' : 'Agent';
    if (!trimmed) return `未命名 ${suffix}`;
    const slice = trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed;
    return slice;
  }
}
