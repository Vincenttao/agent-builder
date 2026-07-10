import { Injectable, Logger } from '@nestjs/common';
import fs from 'node:fs';
import type { AgentSpec, WorkflowSpec } from '@agent-builder/shared-contracts';
import {
  GenerationStatus,
  GenerationType,
  EventType,
  TestStatus,
  JobType,
  SandboxRuntime,
  AgentBuilderError,
  ErrorCode,
} from '@agent-builder/shared-contracts';
import type { CreateDraftRequest, DraftResponse, ConfirmDraftResponse } from '@agent-builder/shared-contracts';
import { GenerationService } from '../generations/generation.service';
import { VersionRepository } from '../generations/repositories/version.repository';
import { EventService } from '../generations/event.service';
import { SpecParserService } from '../spec/spec-parser.service';
import { SpecValidatorService } from '../spec/spec-validator.service';
import { DraftRepository } from '../generations/repositories/draft.repository';
import { SpecRepository } from '../generations/repositories/spec.repository';
import { CodeGenerationService } from '../codegen/codegen.service';
import { lintGeneratedProject } from '../codegen/project-lint';
import { SandboxService } from '../sandbox/sandbox.service';
import { projectRoot } from '../common/workspace';

function isAgentSpec(spec: AgentSpec | WorkflowSpec): spec is AgentSpec {
  return 'tools' in spec && !('nodes' in spec);
}

/**
 * The generation pipeline (architecture §5.2): generating -> write files ->
 * testing -> smoke test -> version + completed (or failed).
 *
 * Run async (fire-and-forget) after createGeneration returns, so the HTTP
 * request is not blocked (P0 plan §10.5 note 3). Failures never overwrite the
 * last completed version (PRD FR-012 / architecture §5.2).
 */
@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly genService: GenerationService,
    private readonly versionRepo: VersionRepository,
    private readonly eventService: EventService,
    private readonly codegen: CodeGenerationService,
    private readonly sandbox: SandboxService,
    private readonly specParser: SpecParserService,
    private readonly specValidator: SpecValidatorService,
    private readonly draftRepo: DraftRepository,
    private readonly specRepo: SpecRepository,
  ) {}

  async runPipeline(generationId: string): Promise<void> {
    try {
      // Phase 9: parse runs in the async pipeline (never on the HTTP path) and
      // is persisted, so a retry does not re-invoke the LLM (§9 test #9).
      const spec = await this.genService.parseAndPersistSpec(generationId);
      const projectPath = await this.generate(generationId, spec);
      // Lint gate — skip for opencode (it uses its own project layout).
      if (this.codegenEngineName() !== 'opencode') {
        lintGeneratedProject(projectPath, spec);
      }
      await this.smokeTest(generationId, spec);
    } catch (err) {
      const code = err instanceof AgentBuilderError ? err.code : ErrorCode.CodeGenerationFailed;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`pipeline failed for ${generationId}: ${code} — ${message}`);
      await this.genService.markFailed(generationId, code, message);
    }
  }

  private async generate(generationId: string, spec: AgentSpec | WorkflowSpec): Promise<string> {
    this.genService.transitionTo(generationId, GenerationStatus.Generating);
    await this.eventService.record({
      generation_id: generationId,
      type: EventType.CommandStarted,
      message: `开始生成代码：${spec.name}`,
      payload: { phase: 'code_generation' },
    });

    const versionId = this.versionRepo.newId();
    const projectPath = projectRoot(generationId, versionId);
    fs.mkdirSync(projectPath, { recursive: true });

    const engineName = this.codegenEngineName();
    const mock = engineName !== 'opencode' || process.env.OPENCODE_REQUIRE_REAL !== 'true';

    const result = await this.codegen.generate(
      spec,
      { generationId, versionId, projectPath, mock },
      {
        onFile: (f) =>
          this.eventService.record({
            generation_id: generationId,
            type: EventType.FileCreated,
            message: `创建文件 ${f.path}`,
            payload: { path: f.path, size: f.size },
          }),
        onEvent: (type, message, payload) =>
          this.eventService.record({
            generation_id: generationId,
            type: type as EventType,
            message,
            payload: (payload ?? {}) as Record<string, unknown>,
          }),
      },
      engineName,
    );

    const version = this.versionRepo.create({
      id: versionId,
      generation_id: generationId,
      version_label: `v1`,
      summary: `feat: 生成 ${spec.name}`,
      project_path: projectPath,
      file_count: result.files.length,
      test_status: TestStatus.Skipped,
      mock_mode: mock,
    });

    await this.eventService.record({
      generation_id: generationId,
      type: EventType.CommandFinished,
      message: `代码生成完成（${result.files.length} 个文件）`,
      payload: {
        phase: 'code_generation',
        file_count: result.files.length,
        version_id: version.id,
        engine: result.engine,
        fallback: result.engine === 'template' && this.codegenEngineName() === 'opencode',
      },
    });
    return projectPath;
  }

  private async smokeTest(generationId: string, spec: AgentSpec | WorkflowSpec): Promise<void> {
    this.genService.transitionTo(generationId, GenerationStatus.Testing);
    const testFile = isAgentSpec(spec) ? 'tests/test_agent_smoke.py' : 'tests/test_workflow_smoke.py';
    await this.eventService.record({
      generation_id: generationId,
      type: EventType.TestStarted,
      message: `运行 smoke test：${testFile}`,
      payload: { test_file: testFile },
    });

    const version = this.genService.getActiveVersion(generationId);
    // Active version isn't set yet (we're still testing) — read the just-created version path.
    const projectPath = this.latestProjectPath(generationId);

    const result = await this.sandbox.run({
      generationId,
      versionId: version?.id ?? null,
      jobType: JobType.SmokeTest,
      command: ['python', '-m', 'pytest', testFile, '-q'],
      workspacePath: projectPath,
      runtime: SandboxRuntime.Mock,
      timeoutSeconds: 90,
    });

    const passed = result.status === 'success';
    const latestVersion = this.latestVersion(generationId);
    if (latestVersion) {
      this.versionRepo.updateTestStatus(latestVersion.id, passed ? TestStatus.Passed : TestStatus.Failed);
    }

    await this.eventService.record({
      generation_id: generationId,
      type: EventType.TestFinished,
      message: passed ? 'smoke test 通过' : 'smoke test 失败',
      payload: { passed, exit_code: result.exitCode, mock: result.mock, run_id: result.jobId },
      run_id: result.jobId,
    });

    if (!passed) {
      throw new AgentBuilderError(ErrorCode.TestFailed, `smoke test 失败（exit ${result.exitCode}）`, {
        stdout: result.stdoutPath,
      });
    }

    if (latestVersion) {
      await this.genService.promoteVersion(generationId, { ...latestVersion, test_status: TestStatus.Passed });
      await this.eventService.record({
        generation_id: generationId,
        type: EventType.Output,
        message: `生成完成：${spec.name}（${latestVersion.file_count} 个文件）`,
        payload: { version_id: latestVersion.id, file_count: latestVersion.file_count, mock: result.mock },
      });
    }
  }

  // ─── Phase 14: Repair ────────────────────────────────────────────

  async repair(generationId: string, instruction?: string): Promise<{ generation_id: string; version_id: string; version_label: string; retry_index: number }> {
    const gen = this.genService.getByIdOrThrow(generationId);
    const existingCount = this.genService.countVersions(generationId);
    const maxRetries = parseInt(process.env.OPENCODE_MAX_RETRIES ?? '2', 10);
    if (existingCount > maxRetries) {
      throw new AgentBuilderError(ErrorCode.CodeGenerationFailed, `已达到最大重试次数 (${maxRetries})，请修改 Spec 后重试`);
    }

    // Reset status so runPipeline can transition
    this.genService.transitionTo(generationId, GenerationStatus.Planning);

    const versionId = this.versionRepo.newId();
    const versionLabel = `v${existingCount + 1}`;
    const lastVersion = this.versionRepo.listByGeneration(generationId)[0];

    // Create version row immediately so the pipeline has it
    this.versionRepo.create({
      id: versionId,
      generation_id: generationId,
      version_label: versionLabel,
      summary: `repair: ${instruction ?? '自动修复'} — ${gen.title}`,
      project_path: projectRoot(generationId, versionId),
      file_count: 0,
      test_status: TestStatus.Skipped,
      mock_mode: true,
      retry_of_version_id: lastVersion?.id ?? null,
      retry_index: existingCount,
    });

    // Run the pipeline asynchronously (same pattern as create)
    void this.runPipeline(generationId).catch((e) => {
      this.logger.error(`repair pipeline error for ${generationId}: ${(e as Error).message}`);
    });

    return { generation_id: generationId, version_id: versionId, version_label: versionLabel, retry_index: existingCount };
  }

  // ─── Phase 15: Draft / Confirm ───────────────────────────────────

  async createDraft(req: CreateDraftRequest): Promise<DraftResponse> {
    const id = this.draftRepo.newId();
    const draft = this.draftRepo.create({
      id,
      user_prompt: req.prompt,
      type: req.type,
    });

    // Parse async — fire and forget
    void this.parseDraftSpec(id, req.prompt, req.type).catch((e) => {
      this.logger.error(`draft spec parse error for ${id}: ${(e as Error).message}`);
    });

    return {
      draft_id: draft.id,
      status: draft.status as DraftResponse['status'],
      type: draft.type,
      user_prompt: draft.user_prompt,
      spec: draft.spec,
      parser_mode: draft.parser_mode,
      provider: draft.provider,
      model: draft.model,
      validation_status: draft.validation_status,
      error_message: draft.error_message,
      created_at: draft.created_at,
    };
  }

  async getDraft(draftId: string): Promise<DraftResponse> {
    const draft = this.draftRepo.getById(draftId);
    if (!draft) {
      throw new AgentBuilderError(ErrorCode.PromptParseFailed, `草稿 ${draftId} 不存在`);
    }
    return {
      draft_id: draft.id,
      status: draft.status as DraftResponse['status'],
      type: draft.type,
      user_prompt: draft.user_prompt,
      spec: draft.spec,
      parser_mode: draft.parser_mode,
      provider: draft.provider,
      model: draft.model,
      validation_status: draft.validation_status,
      error_message: draft.error_message,
      created_at: draft.created_at,
    };
  }

  async updateDraftSpec(draftId: string, spec: unknown): Promise<DraftResponse> {
    const draft = this.draftRepo.getById(draftId);
    if (!draft) {
      throw new AgentBuilderError(ErrorCode.PromptParseFailed, `草稿 ${draftId} 不存在`);
    }
    let validation_status: string;
    try {
      this.specValidator.validate(spec as AgentSpec | WorkflowSpec);
      validation_status = 'valid';
    } catch {
      validation_status = 'invalid';
    }
    this.draftRepo.updateSpec(draftId, spec, validation_status);
    const updated = this.draftRepo.getById(draftId)!;
    return {
      draft_id: updated.id,
      status: updated.status as DraftResponse['status'],
      type: updated.type,
      user_prompt: updated.user_prompt,
      spec: updated.spec,
      parser_mode: updated.parser_mode,
      provider: updated.provider,
      model: updated.model,
      validation_status: updated.validation_status,
      error_message: updated.error_message,
      created_at: updated.created_at,
    };
  }

  async confirmDraft(draftId: string): Promise<ConfirmDraftResponse> {
    const draft = this.draftRepo.getById(draftId);
    if (!draft) {
      throw new AgentBuilderError(ErrorCode.PromptParseFailed, `草稿 ${draftId} 不存在`);
    }
    if (!draft.spec || draft.status === 'failed') {
      throw new AgentBuilderError(ErrorCode.PromptParseFailed, '草稿 Spec 尚未解析成功，无法确认');
    }
    // Validate spec once more before confirming
    const spec = draft.spec as AgentSpec | WorkflowSpec;
    this.specValidator.validate(spec);

    // Create the generation
    const gen = await this.genService.createGeneration({
      type: draft.type as GenerationType,
      prompt: draft.user_prompt,
      mode: 'auto',
      model: 'default',
    });

    // Persist the spec so parseAndPersistSpec won't re-parse
    this.specRepo.save({
      generation_id: gen.id,
      spec,
      parser_mode: draft.parser_mode ?? 'llm',
      provider: draft.provider ?? 'unknown',
      model: draft.model,
      prompt_hash: '',
      validation_status: draft.validation_status ?? 'valid',
    });
    this.draftRepo.markConfirmed(draftId);

    // Run the pipeline
    void this.runPipeline(gen.id).catch((e) => {
      this.logger.error(`pipeline error for ${gen.id}: ${(e as Error).message}`);
    });

    return { generation_id: gen.id, status: gen.status };
  }

  private async parseDraftSpec(draftId: string, prompt: string, type: string): Promise<void> {
    try {
      const result = await this.specParser.parse(prompt, type as GenerationType);
      let validation_status: string;
      try {
        this.specValidator.validate(result.spec);
        validation_status = 'valid';
      } catch {
        validation_status = 'invalid';
      }
      this.draftRepo.setSpec(
        draftId,
        result.spec,
        { parser_mode: result.parserMode, provider: result.provider, model: result.model },
        validation_status,
      );
    } catch (e) {
      this.draftRepo.markFailed(draftId, (e as Error).message);
    }
  }

  /** The configured codegen engine (§4 / Phase 11 task 3). Defaults to template. */
  private codegenEngineName(): 'template' | 'opencode' | 'mock' {
    const e = process.env.CODEGEN_ENGINE ?? 'template';
    return e === 'opencode' || e === 'mock' ? e : 'template';
  }

  /** The most recently created version for a generation (the one under test). */
  private latestVersion(generationId: string) {
    const versions = this.versionRepo.listByGeneration(generationId);
    return versions[0] ?? null; // listByGeneration is DESC by created_at
  }

  private latestProjectPath(generationId: string): string {
    const v = this.latestVersion(generationId);
    return v?.project_path ?? projectRoot(generationId, 'pending');
  }
}
