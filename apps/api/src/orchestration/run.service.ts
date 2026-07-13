import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import fs from 'node:fs';
import type { RunnerResult } from '@agent-builder/shared-contracts';
import {
  RunType,
  RunStatus,
  JobType,
  EventType,
  SandboxRuntime,
  AgentBuilderError,
  ErrorCode,
} from '@agent-builder/shared-contracts';
import { GenerationService } from '../generations/generation.service';
import { RunRepository } from '../generations/repositories/run.repository';
import { EventService } from '../generations/event.service';
import { SandboxService } from '../sandbox/sandbox.service';

/**
 * Runs generated Agent/Workflow projects via the Python Runner inside the
 * sandbox (architecture §5.7, Phase 5 §9.3 task 6). The main API process never
 * runs generated code directly — it schedules a sandbox job.
 *
 * User input is passed via stdin (never as a CLI arg) so the command allowlist
 * never sees user text.
 */
@Injectable()
export class RunService {
  private readonly logger = new Logger(RunService.name);

  constructor(
    private readonly genService: GenerationService,
    private readonly runRepo: RunRepository,
    private readonly eventService: EventService,
    private readonly sandbox: SandboxService,
  ) {}

  async agentRun(generationId: string, message: string): Promise<RunnerResult> {
    const { projectPath, versionId } = this.requireActiveProject(generationId);
    const run = this.runRepo.create({
      id: this.runRepo.newId(),
      generation_id: generationId,
      version_id: versionId,
      run_type: RunType.AgentChat,
      status: RunStatus.Running,
      input: { message },
    });
    await this.eventService.record({
      generation_id: generationId,
      type: EventType.RunStarted,
      message: 'Agent 测试台运行',
      payload: { run_id: run.id, message },
      run_id: run.id,
    });

    const result = await this.executeRunner(projectPath, generationId, versionId, JobType.AgentRun, message);
    this.runRepo.finish(run.id, {
      status: result.status === 'success' ? RunStatus.Success : RunStatus.Failed,
      output: result.output,
      stdout_path: result.stdoutPath,
      stderr_path: result.stderrPath,
      duration_ms: result.durationMs,
    });
    await this.eventService.record({
      generation_id: generationId,
      type: EventType.RunFinished,
      message: `Agent 运行结束：${result.status}`,
      payload: { run_id: run.id, status: result.status },
      run_id: run.id,
    });
    return { status: result.status, output: result.output, events: result.events };
  }

  async workflowRun(generationId: string, inputs: Record<string, unknown>): Promise<RunnerResult> {
    const { projectPath, versionId } = this.requireActiveProject(generationId);
    const run = this.runRepo.create({
      id: this.runRepo.newId(),
      generation_id: generationId,
      version_id: versionId,
      run_type: RunType.WorkflowRun,
      status: RunStatus.Running,
      input: inputs,
    });
    await this.eventService.record({
      generation_id: generationId,
      type: EventType.RunStarted,
      message: 'Workflow 运行',
      payload: { run_id: run.id, inputs },
      run_id: run.id,
    });

    const result = await this.executeRunner(projectPath, generationId, versionId, JobType.WorkflowRun, JSON.stringify(inputs));
    this.runRepo.finish(run.id, {
      status: result.status === 'success' ? RunStatus.Success : RunStatus.Failed,
      output: result.output,
      stdout_path: result.stdoutPath,
      stderr_path: result.stderrPath,
      duration_ms: result.durationMs,
    });
    await this.eventService.record({
      generation_id: generationId,
      type: EventType.RunFinished,
      message: `Workflow 运行结束：${result.status}`,
      payload: { run_id: run.id, status: result.status },
      run_id: run.id,
    });
    return { status: result.status, output: result.output, events: result.events };
  }

  /**
   * Build the env allowlist for the run sandbox, injecting the same LLM
   * credentials used by OpenCode so generated Agents/Workflows can call the
   * real LLM API at runtime (via openai Python SDK).
   */
  /**
   * Build env allowlist for the run sandbox.
   *
   * P4: RUN_LLM_* takes priority (independent runtime credentials).
   * Falls back to OPENCODE_* with a deprecation warning for migration.
   * OPENCODE_* fallback will be removed in P5.
   */
  private buildRunEnv(): Record<string, string> {
    const map: Record<string, string> = {};
    const provider = process.env.RUN_LLM_PROVIDER || process.env.OPENCODE_PROVIDER;
    const apiKey = process.env.RUN_LLM_API_KEY || process.env.OPENCODE_API_KEY;
    const baseUrl = process.env.RUN_LLM_BASE_URL || process.env.OPENCODE_BASE_URL;
    const model = process.env.RUN_LLM_MODEL || process.env.OPENCODE_MODEL;

    if (!process.env.RUN_LLM_API_KEY && process.env.OPENCODE_API_KEY) {
      this.logger.warn(
        'RUN_LLM_API_KEY not set — falling back to OPENCODE_API_KEY. ' +
        'This fallback will be removed in P5. Set RUN_LLM_* for runtime LLM.',
      );
    }

    if (provider && apiKey) {
      map[`${provider.toUpperCase()}_API_KEY`] = apiKey;
      if (baseUrl) map[`${provider.toUpperCase()}_BASE_URL`] = baseUrl;
    }
    if (model) map['AGENT_BUILDER_MODEL'] = model;
    // P4: suppress openjiuwen loguru init logs from polluting stdout JSON
    map['LOGURU_LEVEL'] = 'WARNING';
    map['PYTHONUNBUFFERED'] = '1';
    return map;
  }

  private async executeRunner(
    projectPath: string,
    generationId: string,
    versionId: string,
    jobType: JobType,
    stdin: string,
  ): Promise<RunnerResult & { stdoutPath: string; stderrPath: string; durationMs: number }> {
    const sub = jobType === JobType.AgentRun ? ['agent', 'run', '--project', '.'] : ['workflow', 'run', '--project', '.'];
    const sandboxResult = await this.sandbox.run({
      generationId,
      versionId,
      jobType,
      command: ['python', '-m', 'python_runner.cli', ...sub],
      workspacePath: projectPath,
      runtime: SandboxRuntime.Docker,
      stdin,
      envAllowlist: this.buildRunEnv(),
      timeoutSeconds: 60,
    });

    let stdout = fs.existsSync(sandboxResult.stdoutPath)
      ? fs.readFileSync(sandboxResult.stdoutPath, 'utf8')
      : '';
    let stderr = fs.existsSync(sandboxResult.stderrPath)
      ? fs.readFileSync(sandboxResult.stderrPath, 'utf8')
      : '';

    // P4: openjiuwen import-time logs may pollute stdout before the JSON line.
    // Strip everything before the first '{' so the runner can parse the result.
    const jsonStart = stdout.lastIndexOf('{"status"');
    if (jsonStart > 0) {
      this.logger.debug(`stripping ${jsonStart} bytes of log noise from stdout`);
      stdout = stdout.slice(jsonStart);
    }

    let parsed: RunnerResult;
    try {
      parsed = JSON.parse(stdout) as RunnerResult;
    } catch {
      const stdoutPreview = stdout.slice(-500) || '(空输出)';
      const stderrPreview = stderr.slice(-300) || '(无 stderr)';
      throw new AgentBuilderError(
        ErrorCode.RunFailed,
        `无法运行生成的项目。stdout: ${stdoutPreview}。stderr: ${stderrPreview}`,
        { stdout: stdoutPreview, stderr: stderrPreview },
      );
    }
    return {
      status: parsed.status,
      output: parsed.output,
      events: parsed.events,
      stdoutPath: sandboxResult.stdoutPath,
      stderrPath: sandboxResult.stderrPath,
      durationMs: sandboxResult.durationMs,
    };
  }

  private requireActiveProject(generationId: string): { projectPath: string; versionId: string } {
    const gen = this.genService.getById(generationId);
    if (!gen) {
      throw new NotFoundException({ error_code: 'NOT_FOUND', message: `生成任务 ${generationId} 不存在` });
    }
    const version = this.genService.getActiveVersion(generationId);
    if (!version) {
      throw new BadRequestException({
        error_code: 'NO_ACTIVE_VERSION',
        message: '生成尚未完成，无可运行版本',
      });
    }
    return { projectPath: version.project_path, versionId: version.id };
  }
}
