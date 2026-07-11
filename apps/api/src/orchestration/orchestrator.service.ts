import { Injectable, Logger } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
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
  /** Per-generation in-flight pipeline promises (D-006 concurrency guard). */
  private readonly activePipelines = new Map<string, Promise<void>>();

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

  /** Run the pipeline, ensuring only one is active per generation (D-006). */
  async runPipeline(generationId: string): Promise<void> {
    // If a pipeline is already running, chain onto it.
    const existing = this.activePipelines.get(generationId);
    if (existing) {
      this.logger.warn(`pipeline already running for ${generationId}, chaining`);
      return existing;
    }

    const promise = this.runPipelineInternal(generationId).finally(() => {
      this.activePipelines.delete(generationId);
    });
    this.activePipelines.set(generationId, promise);
    return promise;
  }

  private async runPipelineInternal(generationId: string): Promise<void> {
    const spec = await this.genService.parseAndPersistSpec(generationId);
    const maxRetries = parseInt(process.env.OPENCODE_MAX_RETRIES ?? '2', 10);
    let lastError = '';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Reset status for retry so transitions work correctly (D-007).
      if (attempt > 0) {
        this.genService.resetToPlanning(generationId);
      }

      try {
        const projectPath = await this.generate(generationId, spec, lastError || undefined);
        // Run lint gate for all engines, but only throw for non-opencode (D-008).
        try {
          lintGeneratedProject(projectPath, spec);
        } catch (lintErr) {
          if (this.codegenEngineName() !== 'opencode') throw lintErr;
          const lintMsg = lintErr instanceof Error ? lintErr.message : String(lintErr);
          this.logger.warn(`opencode lint warning: ${lintMsg}`);
          await this.eventService.record({
            generation_id: generationId,
            type: EventType.Thought,
            message: `Lint 警告：${lintMsg}`,
            payload: { lint_warning: true },
          });
        }

        const testResult = await this.smokeTest(generationId, spec);
        // opencode mode: retry if smoke test failed, feeding output back
        if (!testResult.passed && this.codegenEngineName() === 'opencode' && attempt < maxRetries) {
          lastError = `【测试失败】\n${testResult.output}`;
          this.logger.warn(`opencode auto-retry ${attempt + 1}/${maxRetries}`);
          await this.eventService.record({
            generation_id: generationId,
            type: EventType.Thought,
            message: `测试失败，自动修复中（${attempt + 1}/${maxRetries}）`,
            payload: { attempt: attempt + 1, maxRetries },
          });
          continue; // retry loop
        }

        // D-002: If out of retries and still failing, mark as failed.
        if (!testResult.passed && this.codegenEngineName() === 'opencode') {
          this.logger.warn(`opencode pipeline failed after ${maxRetries + 1} attempts`);
          await this.genService.markFailed(
            generationId,
            ErrorCode.TestFailed,
            `smoke test 未通过，已达最大重试次数（${maxRetries + 1}）`,
          );
        }
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof AgentBuilderError ? err.code : ErrorCode.CodeGenerationFailed;
        if (this.codegenEngineName() === 'opencode' && attempt < maxRetries) {
          this.logger.warn(`opencode auto-retry ${attempt + 1}/${maxRetries}: ${msg}`);
          lastError = msg;
          continue; // retry
        }
        this.logger.warn(`pipeline failed for ${generationId}: ${code} — ${msg}`);
        await this.genService.markFailed(generationId, code, msg);
        return;
      }
    }
  }

  private async generate(generationId: string, spec: AgentSpec | WorkflowSpec, lastError?: string): Promise<string> {
    this.genService.transitionTo(generationId, GenerationStatus.Generating);
    const prefix = lastError ? `[自动修复] ` : '';
    await this.eventService.record({
      generation_id: generationId,
      type: EventType.CommandStarted,
      message: `${prefix}开始生成代码：${spec.name}`,
      payload: { phase: 'code_generation', repair: !!lastError },
    });

    const versionId = this.versionRepo.newId();
    const projectPath = projectRoot(generationId, versionId);
    fs.mkdirSync(projectPath, { recursive: true });

    // Inject error context into the project for opencode to read on retry.
    if (lastError) {
      const agentDir = path.join(projectPath, '.agent_builder');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(
        path.join(agentDir, 'fix.md'),
        `# 上一轮生成失败，请修复以下问题\n\n${lastError}\n\n请根据错误信息修改代码，确保所有测试通过。\n`,
        'utf8',
      );
    }

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

    const existingCount = this.genService.countVersions(generationId);
    const versionLabel = `v${existingCount + 1}`;

    const version = this.versionRepo.create({
      id: versionId,
      generation_id: generationId,
      version_label: versionLabel,
      summary: existingCount > 0
        ? `repair: 自动修复 — ${spec.name}`
        : `feat: 生成 ${spec.name}`,
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

  private async smokeTest(generationId: string, spec: AgentSpec | WorkflowSpec): Promise<{ passed: boolean; output: string }> {
    this.genService.transitionTo(generationId, GenerationStatus.Testing);

    const version = this.genService.getActiveVersion(generationId);
    const projectPath = this.latestProjectPath(generationId);

    // T-003: missing smoke test files should fail for opencode.
    const hasTests = this.hasTestFiles(projectPath);
    if (!hasTests) {
      this.logger.warn(`No test files found for ${generationId}`);
      if (this.codegenEngineName() === 'opencode') {
        await this.eventService.record({
          generation_id: generationId,
          type: EventType.Thought,
          message: '缺少 smoke test 文件，将触发自动修复',
          payload: { reason: 'MISSING_SMOKE_TEST' },
        });
        return { passed: false, output: '生成物缺少测试文件 (tests/test_*.py)' };
      }
      // TemplateEngine always includes tests; skip is safe fallback.
      const latestVersion = this.latestVersion(generationId);
      if (latestVersion) {
        this.versionRepo.updateTestStatus(latestVersion.id, TestStatus.Passed);
        await this.genService.promoteVersion(generationId, { ...latestVersion, test_status: TestStatus.Passed });
      }
      await this.eventService.record({
        generation_id: generationId,
        type: EventType.Output,
        message: `生成完成：${spec.name}（${latestVersion?.file_count ?? 0} 个文件）`,
        payload: { version_id: latestVersion?.id, file_count: latestVersion?.file_count ?? 0 },
      });
      return { passed: true, output: '' };
    }

    // opencode projects need pip install before tests can run.
    if (this.codegenEngineName() === 'opencode') {
      await this.sandbox.run({
        generationId,
        versionId: version?.id ?? null,
        jobType: JobType.SmokeTest,
        command: ['python', '-m', 'pip', 'install', '-e', '.', '-q'],
        workspacePath: projectPath,
        timeoutSeconds: 60,
      });
    }

    await this.eventService.record({
      generation_id: generationId,
      type: EventType.TestStarted,
      message: '运行 smoke test',
      payload: { test_dir: 'tests/' },
    });

    const result = await this.sandbox.run({
      generationId,
      versionId: version?.id ?? null,
      jobType: JobType.SmokeTest,
      command: ['python', '-m', 'pytest', 'tests/', '-q'],
      workspacePath: projectPath,
      runtime: SandboxRuntime.Mock,
      timeoutSeconds: 90,
    });

    const passed = result.status === 'success';
    const latestVersion = this.latestVersion(generationId);
    if (latestVersion) {
      this.versionRepo.updateTestStatus(latestVersion.id, passed ? TestStatus.Passed : TestStatus.Failed);
    }

    // Capture test output for retry feedback.
    let testOutput = '';
    if (!passed) {
      try { testOutput = fs.readFileSync(result.stdoutPath, 'utf8').slice(0, 2000); } catch { /* ok */ }
    }

    await this.eventService.record({
      generation_id: generationId,
      type: EventType.TestFinished,
      message: passed ? 'smoke test 通过' : 'smoke test 失败',
      payload: { passed, exit_code: result.exitCode, mock: result.mock, run_id: result.jobId },
      run_id: result.jobId,
    });

    if (!passed) {
      if (this.codegenEngineName() === 'opencode') {
        // Non-blocking but return output for retry feedback.
        await this.eventService.record({
          generation_id: generationId,
          type: EventType.Thought,
          message: `测试未通过 (exit ${result.exitCode})`,
          payload: { exit_code: result.exitCode },
        });
      } else {
        throw new AgentBuilderError(ErrorCode.TestFailed, `smoke test 失败（exit ${result.exitCode}）`, {
          stdout: result.stdoutPath,
        });
      }
    }

    if (latestVersion) {
      // P3-004: only promote versions with passing tests.
      const testOk = passed;
      await this.genService.promoteVersion(generationId, { ...latestVersion, test_status: testOk ? TestStatus.Passed : TestStatus.Failed });
      await this.eventService.record({
        generation_id: generationId,
        type: EventType.Output,
        message: `生成完成：${spec.name}（${latestVersion.file_count} 个文件）${testOk ? '' : '（测试未通过）'}`,
        payload: { version_id: latestVersion.id, file_count: latestVersion.file_count, mock: result.mock },
      });
    }

    return { passed, output: testOutput };
  }

  // ─── Phase 14: Repair ────────────────────────────────────────────

  async repair(generationId: string, instruction?: string): Promise<{ generation_id: string; version_id: string | null; version_label: string; retry_index: number }> {
    const existingCount = this.genService.countVersions(generationId);
    const maxRetries = parseInt(process.env.OPENCODE_MAX_RETRIES ?? '2', 10);
    if (existingCount >= maxRetries + 1) {
      throw new AgentBuilderError(ErrorCode.CodeGenerationFailed, `已达到最大重试次数 (${maxRetries})，请修改 Spec 后重试`);
    }

    // Reset status so the pipeline can transition forward.
    this.genService.transitionTo(generationId, GenerationStatus.Planning);

    const versionLabel = `v${existingCount + 1}`;
    const retryIndex = existingCount;

    // The pipeline's generate() method creates the version with the correct
    // label — no need to pre-create a version here (avoids orphan rows).
    void this.runPipeline(generationId).catch((e) => {
      this.logger.error(`repair pipeline error for ${generationId}: ${(e as Error).message}`);
    });

    if (instruction) {
      this.logger.debug(`repair instruction for ${generationId}: ${instruction}`);
    }

    return { generation_id: generationId, version_id: null, version_label: versionLabel, retry_index: retryIndex };
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

  /** Check if project has any pytest-compatible test files. */
  private hasTestFiles(projectPath: string): boolean {
    const testsDir = path.join(projectPath, 'tests');
    if (!fs.existsSync(testsDir)) return false;
    try {
      return fs.readdirSync(testsDir).some((f) => f.startsWith('test_') && f.endsWith('.py'));
    } catch {
      return false;
    }
  }
}
