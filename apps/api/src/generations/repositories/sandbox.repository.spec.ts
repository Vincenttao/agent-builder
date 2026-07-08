import { createInMemoryDb } from '../../testing/in-memory-db';
import { SandboxJobRepository } from './sandbox.repository';
import {
  JobType,
  SandboxRuntime,
  NetworkPolicy,
  SandboxJobStatus,
} from '@agent-builder/shared-contracts';

describe('SandboxJobRepository (Phase 1 §5.2 — records runtime/commands/limits/exit_code)', () => {
  const db = createInMemoryDb();
  const repo = new SandboxJobRepository(db);
  afterAll(() => db.close());

  it('persists runtime, command argv, resource limits, and network policy', () => {
    const job = repo.create({
      id: repo.newId(),
      generation_id: 'gen_s',
      version_id: 'ver_s',
      job_type: JobType.SmokeTest,
      runtime: SandboxRuntime.Docker,
      image: 'agent-builder-sandbox:latest',
      command: ['python', '-m', 'pytest', 'tests/test_agent_smoke.py'],
      network_policy: NetworkPolicy.None,
      cpus: 1,
      memory: '1g',
      pids_limit: 256,
    });

    expect(job.runtime).toBe(SandboxRuntime.Docker);
    expect(job.command).toEqual(['python', '-m', 'pytest', 'tests/test_agent_smoke.py']);
    expect(job.network_policy).toBe(NetworkPolicy.None);
    expect(job.cpus).toBe(1);
    expect(job.memory).toBe('1g');
    expect(job.pids_limit).toBe(256);
    expect(job.status).toBe(SandboxJobStatus.Pending);
  });

  it('records started_at, exit_code, stdout/stderr paths on finish', () => {
    const job = repo.create({
      id: repo.newId(),
      generation_id: 'gen_s',
      job_type: JobType.AgentRun,
      runtime: SandboxRuntime.Mock,
      image: 'agent-builder-sandbox:latest',
      command: ['python', 'src/main.py'],
      network_policy: NetworkPolicy.None,
      cpus: 1,
      memory: '1g',
      pids_limit: 256,
    });
    repo.start(job.id);
    const started = repo.getById(job.id)!;
    expect(started.status).toBe(SandboxJobStatus.Running);
    expect(started.started_at).not.toBeNull();

    repo.finish(job.id, {
      status: SandboxJobStatus.Success,
      exit_code: 0,
      stdout_path: 'workspace/runs/x/stdout.log',
      stderr_path: 'workspace/runs/x/stderr.log',
    });
    const finished = repo.getById(job.id)!;
    expect(finished.status).toBe(SandboxJobStatus.Success);
    expect(finished.exit_code).toBe(0);
    expect(finished.finished_at).not.toBeNull();
    expect(finished.stdout_path).toBe('workspace/runs/x/stdout.log');
  });

  it('supports gvisor runtime (P0+ target, architecture §12)', () => {
    const job = repo.create({
      id: repo.newId(),
      generation_id: 'gen_s',
      job_type: JobType.OpencodeGeneration,
      runtime: SandboxRuntime.Gvisor,
      image: 'agent-builder-sandbox:latest',
      command: ['opencode', 'run', '--format', 'json', '.agent_builder/prompt.md'],
      network_policy: NetworkPolicy.None,
      cpus: 1,
      memory: '1g',
      pids_limit: 256,
    });
    expect(repo.getById(job.id)!.runtime).toBe(SandboxRuntime.Gvisor);
  });
});
