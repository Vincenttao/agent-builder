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
import { PYTHON_RUNNER_SRC } from '../common/workspace';

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
      payload: { run_id: run.id, status: result.status, mock: result.mock },
      run_id: run.id,
    });
    return { status: result.status, output: result.output, events: result.events, mock: result.mock };
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
      payload: { run_id: run.id, status: result.status, mock: result.mock },
      run_id: run.id,
    });
    return { status: result.status, output: result.output, events: result.events, mock: result.mock };
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
      runtime: SandboxRuntime.Mock,
      stdin,
      envAllowlist: { PYTHONPATH: PYTHON_RUNNER_SRC, MOCK_OPENJIUWEN: 'true' },
      timeoutSeconds: 60,
    });

    const stdout = fs.existsSync(sandboxResult.stdoutPath)
      ? fs.readFileSync(sandboxResult.stdoutPath, 'utf8')
      : '';
    let parsed: RunnerResult;
    try {
      parsed = JSON.parse(stdout) as RunnerResult;
    } catch {
      const preview = stdout.slice(0, 500) || '(空输出)';
      throw new AgentBuilderError(
        ErrorCode.RunFailed,
        `无法运行生成的项目（${preview}）。如果项目刚生成，可能需要先 pip install 或修改源码后再试。`,
        { stdout: preview },
      );
    }
    return {
      status: parsed.status,
      output: parsed.output,
      events: parsed.events,
      mock: parsed.mock,
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
