import { Injectable, Logger } from '@nestjs/common';
import { GenerationRepository } from './repositories/generation.repository';
import { VersionRepository } from './repositories/version.repository';
import { EventService } from './event.service';
import type {
  CreateGenerationRequest,
  Generation,
  ProjectVersion,
} from '@agent-builder/shared-contracts';
import {
  GenerationStatus,
  EventType,
  TestStatus,
} from '@agent-builder/shared-contracts';

/**
 * Orchestrates a generation's lifecycle (architecture §5.2).
 *
 * Phase 1 implements createGeneration (metadata + plan_created event) and the
 * version/failed-integrity primitives. The full generate→test→version pipeline
 * is wired in Phase 6 once spec parsing, code generation and the sandbox exist.
 */
@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly genRepo: GenerationRepository,
    private readonly versionRepo: VersionRepository,
    private readonly eventService: EventService,
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

    // pending -> planning: emit a plan event and advance state.
    await this.eventService.record({
      generation_id: id,
      type: EventType.PlanCreated,
      message: `已创建生成计划：${title}`,
      payload: { type: req.type, title, model: req.model ?? 'default' },
    });
    this.genRepo.updateStatus(id, GenerationStatus.Planning);

    return this.genRepo.getById(id)!;
  }

  getById(id: string): Generation | null {
    return this.genRepo.getById(id);
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
