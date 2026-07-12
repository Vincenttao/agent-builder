import {
  Controller,
  Get,
  Param,
  Query,
  Sse,
  NotFoundException,
  BadRequestException,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { GenerationService } from './generation.service';
import { EventService } from './event.service';
import {
  type GenerationDto,
  toGenerationDto,
  type VersionListResponse,
  type VersionDiffResponse,
  type AgentBuilderManifest,
} from '@agent-builder/shared-contracts';
import { toWorkspaceRelative } from '../common/workspace';
import fs from 'node:fs';
import path from 'node:path';
import { redactSecrets } from '../sandbox/redact';
import { SandboxJobRepository } from './repositories/sandbox.repository';

/**
 * Generation read + SSE endpoints (PRD §11.2–11.3). Creation, files, runs and
 * exports live in the OrchestratorController (Phase 6).
 */
@Controller('api/generations')
export class GenerationsController {
  constructor(
    private readonly genService: GenerationService,
    private readonly eventService: EventService,
    private readonly sandboxJobRepo: SandboxJobRepository,
  ) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): GenerationDto[] {
    const gens = this.genService.listGenerations({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
    return gens.map((g) => {
      const dto = toGenerationDto(g);
      dto.project_path = toWorkspaceRelative(g.project_root);
      // Phase 14: enrich with parser_mode / codegen_engine from events
      const events = this.eventService.history(g.id);
      const thought = events.find((e) => e.type === 'thought');
      const cmdFinished = events.find((e) => e.type === 'command_finished');
      dto.parser_mode = (thought?.payload?.parser_mode as string) ?? null;
      dto.codegen_engine = (cmdFinished?.payload?.engine as string) ?? null;
      return dto;
    });
  }

  @Get(':id')
  get(@Param('id') id: string): GenerationDto {
    const gen = this.genService.getById(id);
    if (!gen) {
      throw new NotFoundException({ error_code: 'NOT_FOUND', message: `生成任务 ${id} 不存在` });
    }
    const dto = toGenerationDto(gen);
    // Architecture §5.2: only project-relative paths returned to clients.
    dto.project_path = toWorkspaceRelative(gen.project_root);
    // Phase 14: enrich with parser_mode / codegen_engine
    const events = this.eventService.history(id);
    const thought = events.find((e) => e.type === 'thought');
    const cmdFinished = events.find((e) => e.type === 'command_finished');
    dto.parser_mode = (thought?.payload?.parser_mode as string) ?? null;
    dto.codegen_engine = (cmdFinished?.payload?.engine as string) ?? null;
    return dto;
  }

  /**
   * SSE event stream (architecture §8.3). Replays persisted history in
   * sequence order, then streams live events until the client disconnects.
   */
  @Sse(':id/events')
  events(@Param('id') id: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      for (const evt of this.eventService.history(id)) {
        subscriber.next({ data: evt, type: evt.type });
      }
      const unsubscribe = this.eventService.subscribe(id, (evt) => {
        subscriber.next({ data: evt, type: evt.type });
      });
      return () => unsubscribe();
    });
  }

  // ─── Phase 14: Versions ──────────────────────────────────────────

  @Get(':id/versions')
  listVersions(@Param('id') id: string): VersionListResponse {
    this.genService.getByIdOrThrow(id);
    return this.genService.listVersions(id);
  }

  // ─── P3-005: Manifest ────────────────────────────────────────────

  @Get(':id/manifest')
  getManifest(@Param('id') id: string): AgentBuilderManifest {
    this.genService.getByIdOrThrow(id);
    return this.genService.getManifest(id);
  }

  @Get(':id/versions/:versionId/diff')
  diffVersions(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Query('base') baseVersionId: string,
  ): VersionDiffResponse {
    this.genService.getByIdOrThrow(id);
    if (!baseVersionId) {
      throw new BadRequestException({ error_code: 'MISSING_BASE', message: '缺少 base 参数' });
    }
    return this.genService.diffVersions(id, baseVersionId, versionId).files;
  }

  // ─── Phase 14: Run logs ──────────────────────────────────────────

  @Get(':id/runs')
  listRuns(@Param('id') id: string) {
    this.genService.getByIdOrThrow(id);
    return this.sandboxJobRepo.listByGeneration(id);
  }

  @Get(':id/runs/:runId/logs')
  getRunLog(
    @Param('id') id: string,
    @Param('runId') runId: string,
    @Query('stream') stream?: string,
    @Query('tail') tail?: string,
  ) {
    this.genService.getByIdOrThrow(id);
    // Validate run belongs to this generation
    const job = this.sandboxJobRepo.getById(runId);
    if (!job || job.generation_id !== id) {
      throw new NotFoundException({ error_code: 'RUN_NOT_FOUND', message: `运行记录 ${runId} 不存在` });
    }

    const streamName = stream === 'stderr' ? 'stderr' : 'stdout';
    const filePath = streamName === 'stdout' ? job.stdout_path : job.stderr_path;
    if (!filePath) {
      return { run_id: runId, stream: streamName, tail: 0, content: '', totalSize: 0 };
    }

    // Path-traversal guard
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(process.env.WORKSPACE_DIR ?? path.join(process.cwd(), '..', '..', 'workspace')))) {
      throw new BadRequestException({ error_code: 'INVALID_PATH', message: '日志路径非法' });
    }

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return { run_id: runId, stream: streamName, tail: 0, content: '', totalSize: 0 };
    }

    content = redactSecrets(content);
    const totalSize = Buffer.byteLength(content, 'utf8');
    const tailN = tail ? parseInt(tail, 10) : 200;
    const lines = content.split('\n');
    const tailed = lines.slice(-tailN).join('\n');

    return { run_id: runId, stream: streamName, tail: tailN, content: tailed, totalSize };
  }
}
