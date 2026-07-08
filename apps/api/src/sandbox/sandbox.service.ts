import { Injectable, Logger, BadRequestException, Inject } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { SandboxRuntime, NetworkPolicy, EventType } from '@agent-builder/shared-contracts';
import { SandboxJobRepository } from '../generations/repositories/sandbox.repository';
import { EventService } from '../generations/event.service';
import { isCommandAllowed } from './command-allowlist';
import type { SandboxRunRequest, SandboxRunResult } from './sandbox-runner';
import { MockSandboxRunner } from './mock-sandbox-runner';
import { DockerSandboxRunner } from './docker-sandbox-runner';
import { RUNS_DIR } from '../common/workspace';

export const RUNS_DIR_TOKEN = 'RUNS_DIR';

/**
 * Orchestrates task-level sandbox execution (architecture §5.6, §5.7).
 *
 * Flow: allowlist check -> create SandboxJob -> select runner -> run ->
 * capture stdout/stderr to workspace/runs/{jobId} -> finish SandboxJob.
 *
 * The main API process never runs generated code directly — it only schedules
 * a sandbox job (architecture §5.7 constraint #6).
 */
@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);

  constructor(
    private readonly jobRepo: SandboxJobRepository,
    private readonly eventService: EventService,
    private readonly mockRunner: MockSandboxRunner,
    private readonly dockerRunner: DockerSandboxRunner,
    @Inject(RUNS_DIR_TOKEN) private readonly runsDir: string = RUNS_DIR,
  ) {}

  /**
   * Pick a runner. Mock is always available; Docker is used when the binary
   * is present and the requested runtime isn't explicitly `mock` (plan §13).
   */
  selectRunner(runtime?: SandboxRuntime): { runner: 'mock' | 'docker'; mock: boolean } {
    const requested = runtime ?? SandboxRuntime.Docker;
    if (requested === SandboxRuntime.Mock) {
      return { runner: 'mock', mock: true };
    }
    if (this.dockerRunner.isAvailable()) {
      return { runner: 'docker', mock: false };
    }
    this.logger.warn(
      `Container runtime unavailable (requested ${requested}); falling back to MockSandboxRunner.`,
    );
    return { runner: 'mock', mock: true };
  }

  async run(req: SandboxRunRequest): Promise<SandboxRunResult> {
    // #7 — forbidden commands never reach a container/subprocess.
    const check = isCommandAllowed(req.command);
    if (!check.ok) {
      throw new BadRequestException({
        error_code: 'COMMAND_NOT_ALLOWED',
        message: `命令被沙箱拒绝：${check.reason}`,
      });
    }

    const runtime = req.runtime ?? SandboxRuntime.Docker;
    const { mock } = this.selectRunner(runtime);
    const runner = mock ? this.mockRunner : this.dockerRunner;

    const job = this.jobRepo.create({
      id: this.jobRepo.newId(),
      generation_id: req.generationId,
      version_id: req.versionId ?? null,
      job_type: req.jobType,
      runtime: mock ? SandboxRuntime.Mock : runtime,
      image: req.image ?? 'agent-builder-sandbox:latest',
      command: req.command,
      network_policy: req.networkPolicy ?? NetworkPolicy.None,
      cpus: req.resourceLimits?.cpus ?? 1,
      memory: req.resourceLimits?.memory ?? '1g',
      pids_limit: req.resourceLimits?.pids_limit ?? 256,
    });

    const logDir = path.join(this.runsDir, job.id);
    fs.mkdirSync(logDir, { recursive: true });

    this.jobRepo.start(job.id);
    await this.eventService.record({
      generation_id: req.generationId,
      type: EventType.SandboxStarted,
      message: `沙箱任务启动：${req.command.join(' ')}`,
      payload: { job_id: job.id, job_type: req.jobType, mock, runtime: job.runtime },
      run_id: job.id,
    });

    let result: SandboxRunResult;
    try {
      result = await runner.run(req, job.id, logDir);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`sandbox run threw: ${msg}`);
      result = {
        jobId: job.id,
        runtime: mock ? SandboxRuntime.Mock : runtime,
        status: 'failed' as SandboxRunResult['status'],
        exitCode: null,
        stdoutPath: path.join(logDir, 'stdout.log'),
        stderrPath: path.join(logDir, 'stderr.log'),
        durationMs: 0,
        mock,
      };
    }

    this.jobRepo.finish(job.id, {
      status: result.status,
      exit_code: result.exitCode,
      stdout_path: result.stdoutPath,
      stderr_path: result.stderrPath,
    });
    await this.eventService.record({
      generation_id: req.generationId,
      type: EventType.SandboxFinished,
      message: `沙箱任务结束：${result.status} (exit ${result.exitCode})`,
      payload: {
        job_id: job.id,
        status: result.status,
        exit_code: result.exitCode,
        duration_ms: result.durationMs,
        mock: result.mock,
      },
      run_id: job.id,
    });

    return result;
  }
}
