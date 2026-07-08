import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  NotFoundException,
  BadRequestException,
  Res,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GenerationService } from '../generations/generation.service';
import { OrchestratorService } from './orchestrator.service';
import { RunService } from './run.service';
import { ExportService } from './export.service';
import { scanTree, readFileSafe, PathSafetyError } from '../files/file-service';
import {
  createGenerationRequestSchema,
  agentRunRequestSchema,
  workflowRunRequestSchema,
  type CreateGenerationRequest,
  type CreateGenerationResponse,
  type AgentRunRequest,
  type WorkflowRunRequest,
  type RunnerResult,
  type FileTreeNode,
  type FileContentResponse,
  type CreateExportResponse,
} from '@agent-builder/shared-contracts';

/**
 * Generation orchestration endpoints (PRD §11). POST creates + kicks off the
 * async pipeline; files / runs / exports operate on the active version.
 */
@Controller('api/generations')
export class OrchestratorController {
  private readonly logger = new Logger(OrchestratorController.name);

  constructor(
    private readonly genService: GenerationService,
    private readonly orchestrator: OrchestratorService,
    private readonly runService: RunService,
    private readonly exportService: ExportService,
  ) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(createGenerationRequestSchema)) body: CreateGenerationRequest,
  ): Promise<CreateGenerationResponse> {
    const gen = await this.genService.createGeneration(body);
    // Long task runs async — request returns immediately (P0 plan §10.5 note 3).
    void this.orchestrator.runPipeline(gen.id).catch((e) => {
      this.logger.error(`pipeline error for ${gen.id}: ${(e as Error).message}`);
    });
    return { generation_id: gen.id, status: gen.status };
  }

  @Get(':id/files')
  files(@Param('id') id: string): FileTreeNode[] {
    const version = this.genService.getActiveVersion(id);
    if (!version) {
      throw new NotFoundException({ error_code: 'NO_ACTIVE_VERSION', message: '尚无可用版本' });
    }
    return scanTree(version.project_path);
  }

  @Get(':id/files/content')
  fileContent(
    @Param('id') id: string,
    @Query('path') relPath: string,
  ): FileContentResponse {
    const version = this.genService.getActiveVersion(id);
    if (!version) {
      throw new NotFoundException({ error_code: 'NO_ACTIVE_VERSION', message: '尚无可用版本' });
    }
    try {
      return readFileSafe(version.project_path, relPath);
    } catch (e) {
      if (e instanceof PathSafetyError) {
        throw new BadRequestException({ error_code: 'INVALID_PATH', message: e.message });
      }
      throw e;
    }
  }

  @Post(':id/agent/runs')
  agentRun(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(agentRunRequestSchema)) body: AgentRunRequest,
  ): Promise<RunnerResult> {
    return this.runService.agentRun(id, body.message);
  }

  @Post(':id/workflow/runs')
  workflowRun(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(workflowRunRequestSchema)) body: WorkflowRunRequest,
  ): Promise<RunnerResult> {
    return this.runService.workflowRun(id, body.inputs);
  }

  @Post(':id/exports')
  export(@Param('id') id: string): Promise<CreateExportResponse> {
    return this.exportService.create(id);
  }
}

@Controller('api/exports')
export class ExportsController {
  constructor(private readonly exportService: ExportService) {}

  @Get(':id/download')
  download(@Param('id') id: string, @Res() res: Response): void {
    const zipPath = this.exportService.zipPath(id);
    if (!zipPath) {
      throw new NotFoundException({ error_code: 'NOT_FOUND', message: `导出 ${id} 不存在` });
    }
    res.download(zipPath, `${id}.zip`);
  }
}
