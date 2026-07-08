import { Injectable, Logger } from '@nestjs/common';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SandboxRuntime, SandboxJobStatus } from '@agent-builder/shared-contracts';
import type { SandboxRunner, SandboxRunRequest, SandboxRunResult } from './sandbox-runner';
import { buildDockerArgs } from './docker-command-builder';

const DEFAULT_IMAGE = 'agent-builder-sandbox:latest';
const DEFAULT_TIMEOUT_SECONDS = 120;

/**
 * Verify a container runtime actually runs (not just present on PATH).
 * On WSL, the Windows docker.exe may be on PATH but fail to execute in the
 * distro — so we invoke `--version` and require a clean exit.
 */
function runtimeWorks(bin: string): boolean {
  try {
    const { status } = spawnSync(bin, ['--version'], { stdio: 'ignore' });
    return status === 0;
  } catch {
    return false;
  }
}

/**
 * Docker/Podman/gVisor sandbox runner. Uses DockerCommandBuilder to produce
 * the hardened argv (no shell) and spawns the container runtime.
 *
 * In environments without Docker (this P0 dev env), isAvailable() is false and
 * SandboxService falls back to MockSandboxRunner (plan §13).
 */
@Injectable()
export class DockerSandboxRunner implements SandboxRunner {
  private readonly logger = new Logger(DockerSandboxRunner.name);
  readonly runtime: SandboxRuntime = SandboxRuntime.Docker;

  isAvailable(): boolean {
    return runtimeWorks('docker') || runtimeWorks('podman');
  }

  async run(
    req: SandboxRunRequest,
    jobId: string,
    logDir: string,
  ): Promise<SandboxRunResult> {
    fs.mkdirSync(logDir, { recursive: true });
    const stdoutPath = path.join(logDir, 'stdout.log');
    const stderrPath = path.join(logDir, 'stderr.log');
    const out = fs.createWriteStream(stdoutPath);
    const err = fs.createWriteStream(stderrPath);
    const start = Date.now();

    const args = buildDockerArgs({
      runtime: req.runtime ?? SandboxRuntime.Docker,
      image: req.image ?? DEFAULT_IMAGE,
      workspacePath: req.workspacePath,
      command: req.command,
      networkPolicy: req.networkPolicy,
      resourceLimits: req.resourceLimits,
    });

    return new Promise<SandboxRunResult>((resolve) => {
      const child = spawn(args[0], args.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: (req.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000,
      });
      child.stdout?.pipe(out);
      child.stderr?.pipe(err);

      const done = (status: SandboxJobStatus, exitCode: number | null) => {
        resolve({
          jobId,
          runtime: this.runtime,
          status,
          exitCode,
          stdoutPath,
          stderrPath,
          durationMs: Date.now() - start,
          mock: false,
        });
      };

      child.on('error', (e: Error) => {
        err.write(`docker spawn error: ${e.message}\n`);
        out.end();
        err.end();
        this.logger.warn(`docker sandbox spawn error: ${e.message}`);
        done(SandboxJobStatus.Failed, null);
      });
      child.on('close', (code, signal) => {
        out.end();
        err.end();
        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          done(SandboxJobStatus.Timeout, null);
        } else {
          done(code === 0 ? SandboxJobStatus.Success : SandboxJobStatus.Failed, code);
        }
      });
    });
  }
}
