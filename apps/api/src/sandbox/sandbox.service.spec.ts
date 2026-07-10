import { BadRequestException } from '@nestjs/common';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInMemoryDb } from '../testing/in-memory-db';
import { SandboxJobRepository } from '../generations/repositories/sandbox.repository';
import { EventRepository } from '../generations/repositories/event.repository';
import { EventService } from '../generations/event.service';
import { SandboxService } from './sandbox.service';
import { MockSandboxRunner } from './mock-sandbox-runner';
import { DockerSandboxRunner } from './docker-sandbox-runner';
import {
  JobType,
  SandboxRuntime,
  SandboxJobStatus,
  EventType,
} from '@agent-builder/shared-contracts';

describe('SandboxService (Phase 3 §7.2 — mock sandbox fallback)', () => {
  const db = createInMemoryDb();
  const jobRepo = new SandboxJobRepository(db);
  const eventRepo = new EventRepository(db);
  const eventService = new EventService(eventRepo);
  const mockRunner = new MockSandboxRunner();
  const dockerRunner = new DockerSandboxRunner();
  const runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-runs-'));
  const sandbox = new SandboxService(jobRepo, eventService, mockRunner, dockerRunner, runsDir);

  afterAll(() => {
    db.close();
    fs.rmSync(runsDir, { recursive: true, force: true });
  });

  function mkWorkspace(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-ws-'));
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    return dir;
  }

  it('#1 runs python --version inside the sandbox (mock fallback)', async () => {
    const ws = mkWorkspace({});
    const result = await sandbox.run({
      generationId: 'gen_test',
      jobType: JobType.SmokeTest,
      command: ['python', '--version'],
      workspacePath: ws,
      runtime: SandboxRuntime.Mock,
      timeoutSeconds: 15,
    });
    expect(result.status).toBe(SandboxJobStatus.Success);
    expect(result.exitCode).toBe(0);
    expect(result.mock).toBe(true);
    // #6 stdout captured to the run log.
    expect(fs.existsSync(result.stdoutPath)).toBe(true);
    const out = fs.readFileSync(result.stdoutPath, 'utf8');
    const err = fs.existsSync(result.stderrPath) ? fs.readFileSync(result.stderrPath, 'utf8') : '';
    expect((out + err)).toMatch(/Python/);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it('#2 runs an empty pytest test inside the sandbox', async () => {
    const ws = mkWorkspace({
      'tests/test_empty.py': 'def test_pass():\n    pass\n',
    });
    const result = await sandbox.run({
      generationId: 'gen_test',
      jobType: JobType.SmokeTest,
      command: ['python', '-m', 'pytest', 'tests/test_empty.py', '-q'],
      workspacePath: ws,
      runtime: SandboxRuntime.Mock,
      timeoutSeconds: 30,
    });
    expect(result.status).toBe(SandboxJobStatus.Success);
    expect(result.exitCode).toBe(0);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it('#5 marks a long-running task as timeout and kills it', async () => {
    const ws = mkWorkspace({
      'tests/test_slow.py': 'import time\ndef test_slow():\n    time.sleep(30)\n',
    });
    const start = Date.now();
    const result = await sandbox.run({
      generationId: 'gen_test',
      jobType: JobType.SmokeTest,
      command: ['python', '-m', 'pytest', 'tests/test_slow.py', '-q'],
      workspacePath: ws,
      runtime: SandboxRuntime.Mock,
      timeoutSeconds: 2,
    });
    const elapsed = Date.now() - start;
    expect(result.status).toBe(SandboxJobStatus.Timeout);
    // Killed well before the 30s sleep finishes.
    expect(elapsed).toBeLessThan(10000);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it('#7 forbidden command is rejected before any execution', async () => {
    const ws = mkWorkspace({});
    const before = jobRepo.listByGeneration('gen_forbid').length;
    await expect(
      sandbox.run({
        generationId: 'gen_forbid',
        jobType: JobType.SmokeTest,
        command: ['rm', '-rf', '/'],
        workspacePath: ws,
        runtime: SandboxRuntime.Mock,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // No sandbox job persisted for the rejected command.
    const after = jobRepo.listByGeneration('gen_forbid').length;
    expect(after).toBe(before);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it('records a SandboxJob with runtime, command, limits, and exit_code', async () => {
    const ws = mkWorkspace({});
    const result = await sandbox.run({
      generationId: 'gen_job',
      versionId: 'ver_job',
      jobType: JobType.AgentRun,
      command: ['python', '--version'],
      workspacePath: ws,
      runtime: SandboxRuntime.Mock,
      timeoutSeconds: 10,
    });
    const job = jobRepo.getById(result.jobId)!;
    expect(job).not.toBeNull();
    expect(job.runtime).toBe(SandboxRuntime.Mock);
    expect(job.command).toEqual(['python', '--version']);
    expect(job.exit_code).toBe(0);
    expect(job.status).toBe(SandboxJobStatus.Success);
    expect(job.stdout_path).toBe(result.stdoutPath);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it('emits sandbox_started + sandbox_finished events', async () => {
    const ws = mkWorkspace({});
    await sandbox.run({
      generationId: 'gen_evt',
      jobType: JobType.SmokeTest,
      command: ['python', '--version'],
      workspacePath: ws,
      runtime: SandboxRuntime.Mock,
    });
    const events = eventService.history('gen_evt');
    expect(events.some((e) => e.type === EventType.SandboxStarted)).toBe(true);
    expect(events.some((e) => e.type === EventType.SandboxFinished)).toBe(true);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it('selectRunner always returns mock runner when Mock is requested', () => {
    const sel = sandbox.selectRunner(SandboxRuntime.Mock);
    expect(sel.runner).toBe('mock');
    expect(sel.mock).toBe(true);
  });

  it('selectRunner picks the best available runtime for Docker requests', () => {
    const sel = sandbox.selectRunner(SandboxRuntime.Docker);
    // Uses Docker if available, mock otherwise.
    expect(['docker', 'mock']).toContain(sel.runner);
  });
});
