import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../../database/database.service';
import type { SandboxJob } from '@agent-builder/shared-contracts';
import {
  JobType,
  SandboxRuntime,
  NetworkPolicy,
  SandboxJobStatus,
} from '@agent-builder/shared-contracts';

interface SandboxJobRow {
  id: string;
  generation_id: string;
  version_id: string | null;
  job_type: string;
  runtime: string;
  image: string;
  command_json: string;
  network_policy: string;
  cpus: number;
  memory: string;
  pids_limit: number;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  stdout_path: string | null;
  stderr_path: string | null;
}

function rowToJob(row: SandboxJobRow): SandboxJob {
  return {
    id: row.id,
    generation_id: row.generation_id,
    version_id: row.version_id,
    job_type: row.job_type as JobType,
    runtime: row.runtime as SandboxRuntime,
    image: row.image,
    command: JSON.parse(row.command_json) as string[],
    network_policy: row.network_policy as NetworkPolicy,
    cpus: row.cpus,
    memory: row.memory,
    pids_limit: row.pids_limit,
    status: row.status as SandboxJobStatus,
    started_at: row.started_at,
    finished_at: row.finished_at,
    exit_code: row.exit_code,
    stdout_path: row.stdout_path,
    stderr_path: row.stderr_path,
  };
}

export interface CreateSandboxJobInput {
  generation_id: string;
  version_id?: string | null;
  job_type: JobType;
  runtime: SandboxRuntime;
  image: string;
  command: string[];
  network_policy: NetworkPolicy;
  cpus: number;
  memory: string;
  pids_limit: number;
}

@Injectable()
export class SandboxJobRepository {
  constructor(private readonly dbService: DatabaseService) {}

  newId(): string {
    return `sjob_${uuidv4()}`;
  }

  create(input: CreateSandboxJobInput & { id: string }): SandboxJob {
    this.dbService.db
      .prepare(
        `INSERT INTO sandbox_jobs
          (id, generation_id, version_id, job_type, runtime, image, command_json, network_policy,
           cpus, memory, pids_limit, status, started_at, finished_at, exit_code, stdout_path, stderr_path)
          VALUES (@id, @generation_id, @version_id, @job_type, @runtime, @image, @command_json, @network_policy,
                  @cpus, @memory, @pids_limit, @status, NULL, NULL, NULL, NULL, NULL)`,
      )
      .run({
        ...input,
        version_id: input.version_id ?? null,
        command_json: JSON.stringify(input.command),
        status: SandboxJobStatus.Pending,
      });
    return this.getById(input.id)!;
  }

  getById(id: string): SandboxJob | null {
    const row = this.dbService.db
      .prepare('SELECT * FROM sandbox_jobs WHERE id = ?')
      .get(id) as SandboxJobRow | undefined;
    return row ? rowToJob(row) : null;
  }

  start(id: string): void {
    this.dbService.db
      .prepare(
        "UPDATE sandbox_jobs SET status = ?, started_at = ? WHERE id = ?",
      )
      .run(SandboxJobStatus.Running, new Date().toISOString(), id);
  }

  finish(
    id: string,
    result: {
      status: SandboxJobStatus;
      exit_code: number | null;
      stdout_path?: string | null;
      stderr_path?: string | null;
    },
  ): void {
    this.dbService.db
      .prepare(
        `UPDATE sandbox_jobs SET status = @status, finished_at = @finished_at, exit_code = @exit_code,
            stdout_path = @stdout_path, stderr_path = @stderr_path WHERE id = @id`,
      )
      .run({
        id,
        status: result.status,
        finished_at: new Date().toISOString(),
        exit_code: result.exit_code,
        stdout_path: result.stdout_path ?? null,
        stderr_path: result.stderr_path ?? null,
      });
  }

  listByGeneration(generation_id: string): SandboxJob[] {
    const rows = this.dbService.db
      .prepare('SELECT * FROM sandbox_jobs WHERE generation_id = ? ORDER BY started_at IS NULL, started_at DESC')
      .all(generation_id) as SandboxJobRow[];
    return rows.map(rowToJob);
  }
}
