import { Injectable, Logger } from '@nestjs/common';
import fs from 'node:fs';
import type { AgentSpec, WorkflowSpec } from '@agent-builder/shared-contracts';
import {
  GenerationStatus,
  EventType,
  TestStatus,
  JobType,
  SandboxRuntime,
  AgentBuilderError,
  ErrorCode,
} from '@agent-builder/shared-contracts';
import { GenerationService } from '../generations/generation.service';
import { VersionRepository } from '../generations/repositories/version.repository';
import { EventService } from '../generations/event.service';
import { CodeGenerationService } from '../codegen/codegen.service';
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
  ) {}

  async runPipeline(generationId: string): Promise<void> {
    try {
      const spec = this.genService.getSpec(generationId);
      await this.generate(generationId, spec);
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

    const result = await this.codegen.generate(
      spec,
      { generationId, versionId, projectPath, mock: true },
      {
        onFile: (f) =>
          this.eventService.record({
            generation_id: generationId,
            type: EventType.FileCreated,
            message: `创建文件 ${f.path}`,
            payload: { path: f.path, size: f.size },
          }),
      },
    );

    const version = this.versionRepo.create({
      id: versionId,
      generation_id: generationId,
      version_label: `v1`,
      summary: `feat: 生成 ${spec.name}`,
      project_path: projectPath,
      file_count: result.files.length,
      test_status: TestStatus.Skipped,
      mock_mode: true,
    });

    await this.eventService.record({
      generation_id: generationId,
      type: EventType.CommandFinished,
      message: `代码生成完成（${result.files.length} 个文件）`,
      payload: { phase: 'code_generation', file_count: result.files.length, version_id: version.id },
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
        message: `生成完成：${spec.name}（${latestVersion.file_count} 个文件，mock 模式）`,
        payload: { version_id: latestVersion.id, file_count: latestVersion.file_count, mock: true },
      });
    }
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
