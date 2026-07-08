import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SandboxRuntime, SandboxJobStatus } from '@agent-builder/shared-contracts';
import type { SandboxRunner, SandboxRunRequest, SandboxRunResult } from './sandbox-runner';
import { filterEnv } from './command-allowlist';

const DEFAULT_TIMEOUT_SECONDS = 120;

/**
 * Mock sandbox runner — the no-Docker fallback (P0 plan §13).
 *
 * Executes the (already-allowlisted) command as a subprocess with:
 *  - cwd bound to the task workspace (no escape to host project files),
 *  - env filtered to the allowlist (no secret leak),
 *  - a hard timeout that kills the process,
 *  - stdout/stderr captured to the run log dir.
 *
 * It does NOT provide container isolation — only the execution-boundary
 * controls. The mock is used for unit tests and for live runs when no
 * container runtime is available (documented in p0_acceptance_report.md).
 */
@Injectable()
export class MockSandboxRunner implements SandboxRunner {
  private readonly logger = new Logger(MockSandboxRunner.name);
  readonly runtime: SandboxRuntime = SandboxRuntime.Mock;

  isAvailable(): boolean {
    return true;
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
    const timeoutMs = (req.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000;

    return new Promise<SandboxRunResult>((resolve) => {
      const child = spawn(req.command[0], req.command.slice(1), {
        cwd: req.workspacePath,
        env: filterEnv(process.env as Record<string, string>, req.envAllowlist),
        stdio: req.stdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
      });

      // Collect in memory; write synchronously on close to avoid stream races.
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      child.stdout?.on('data', (c: Buffer) => stdoutChunks.push(c));
      child.stderr?.on('data', (c: Buffer) => stderrChunks.push(c));

      if (req.stdin && child.stdin) {
        child.stdin.end(req.stdin);
      }

      const done = (status: SandboxJobStatus, exitCode: number | null) => {
        try {
          fs.writeFileSync(stdoutPath, Buffer.concat(stdoutChunks));
          fs.writeFileSync(stderrPath, Buffer.concat(stderrChunks));
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
          mock: true,
        });
      };

      child.on('error', (e: Error) => {
        stderrChunks.push(Buffer.from(`sandbox spawn error: ${e.message}\n`));
        this.logger.warn(`mock sandbox spawn error: ${e.message}`);
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
