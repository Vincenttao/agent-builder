import { Injectable, Logger } from '@nestjs/common';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SandboxRuntime, SandboxJobStatus } from '@agent-builder/shared-contracts';
import type { SandboxRunner, SandboxRunRequest, SandboxRunResult } from './sandbox-runner';
import { buildDockerArgs } from './docker-command-builder';
import { redactBuffer } from './redact';

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
    const start = Date.now();

    // Translate container workspace path to host path for docker -v mounts.
    // When the API runs in Docker, WORKSPACE_DIR is /workspace (container),
    // but the Docker daemon needs the host path (e.g. ./workspace).
    let hostWorkspace = req.workspacePath;
    const hostDir = process.env.HOST_WORKSPACE_DIR;
    const containerDir = process.env.WORKSPACE_DIR;
    if (hostDir && containerDir && hostDir !== containerDir) {
      hostWorkspace = req.workspacePath.replace(containerDir, hostDir);
    }

    const args = buildDockerArgs({
      runtime: req.runtime ?? SandboxRuntime.Docker,
      image: req.image ?? DEFAULT_IMAGE,
      workspacePath: hostWorkspace,
      command: req.command,
      networkPolicy: req.networkPolicy,
      resourceLimits: req.resourceLimits,
    });

    return new Promise<SandboxRunResult>((resolve) => {
      const child = spawn(args[0], args.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: (req.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000,
      });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let stdoutLineBuf = '';
      let stderrLineBuf = '';
      child.stdout?.on('data', (c: Buffer) => {
        stdoutChunks.push(c);
        if (req.onStdout) {
          stdoutLineBuf += c.toString('utf8');
          const lines = stdoutLineBuf.split('\n');
          stdoutLineBuf = lines.pop() ?? '';
          for (const line of lines) {
            if (line.trim()) req.onStdout(line);
          }
        }
      });
      child.stderr?.on('data', (c: Buffer) => {
        stderrChunks.push(c);
        if (req.onStderr) {
          stderrLineBuf += c.toString('utf8');
          const lines = stderrLineBuf.split('\n');
          stderrLineBuf = lines.pop() ?? '';
          for (const line of lines) {
            if (line.trim()) req.onStderr(line);
          }
        }
      });

      const done = (status: SandboxJobStatus, exitCode: number | null) => {
        try {
          fs.writeFileSync(stdoutPath, redactBuffer(Buffer.concat(stdoutChunks)));
          fs.writeFileSync(stderrPath, redactBuffer(Buffer.concat(stderrChunks)));
        } catch (e) {
          this.logger.warn(`failed to write run logs: ${(e as Error).message}`);
        }
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
        stderrChunks.push(Buffer.from(`docker spawn error: ${e.message}\n`));
        this.logger.warn(`docker sandbox spawn error: ${e.message}`);
        done(SandboxJobStatus.Failed, null);
      });
      child.on('close', (code, signal) => {
        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          done(SandboxJobStatus.Timeout, null);
        } else {
          done(code === 0 ? SandboxJobStatus.Success : SandboxJobStatus.Failed, code);
        }
      });
    });
  }
}
