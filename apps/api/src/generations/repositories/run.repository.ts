import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../../database/database.service';
import type { RunRecord } from '@agent-builder/shared-contracts';
import { RunType, RunStatus } from '@agent-builder/shared-contracts';

interface RunRow {
  id: string;
  generation_id: string;
  version_id: string | null;
  run_type: string;
  status: string;
  input_json: string | null;
  output_json: string | null;
  stdout_path: string | null;
  stderr_path: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

function rowToRun(row: RunRow): RunRecord {
  return {
    id: row.id,
    generation_id: row.generation_id,
    version_id: row.version_id,
    run_type: row.run_type as RunType,
    status: row.status as RunStatus,
    input_json: row.input_json ? (JSON.parse(row.input_json) as Record<string, unknown>) : null,
    output_json: row.output_json ? (JSON.parse(row.output_json) as Record<string, unknown>) : null,
    stdout_path: row.stdout_path,
    stderr_path: row.stderr_path,
    duration_ms: row.duration_ms,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface CreateRunInput {
  generation_id: string;
  version_id?: string | null;
  run_type: RunType;
  status: RunStatus;
  input?: Record<string, unknown> | null;
}

@Injectable()
export class RunRepository {
  constructor(private readonly dbService: DatabaseService) {}

  newId(): string {
    return `run_${uuidv4()}`;
  }

  create(input: CreateRunInput & { id: string }): RunRecord {
    const now = new Date().toISOString();
    this.dbService.db
      .prepare(
        `INSERT INTO run_records
          (id, generation_id, version_id, run_type, status, input_json, output_json, stdout_path, stderr_path, duration_ms, created_at, updated_at)
          VALUES (@id, @generation_id, @version_id, @run_type, @status, @input_json, NULL, NULL, NULL, NULL, @created_at, @updated_at)`,
      )
      .run({
        id: input.id,
        generation_id: input.generation_id,
        version_id: input.version_id ?? null,
        run_type: input.run_type,
        status: input.status,
        input_json: input.input ? JSON.stringify(input.input) : null,
        created_at: now,
        updated_at: now,
      });
    return this.getById(input.id)!;
  }

  getById(id: string): RunRecord | null {
    const row = this.dbService.db
      .prepare('SELECT * FROM run_records WHERE id = ?')
      .get(id) as RunRow | undefined;
    return row ? rowToRun(row) : null;
  }

  finish(
    id: string,
    result: {
      status: RunStatus;
      output?: Record<string, unknown> | null;
      stdout_path?: string | null;
      stderr_path?: string | null;
      duration_ms?: number | null;
    },
  ): void {
    this.dbService.db
      .prepare(
        `UPDATE run_records
          SET status = @status, output_json = @output_json, stdout_path = @stdout_path,
              stderr_path = @stderr_path, duration_ms = @duration_ms, updated_at = @updated_at
          WHERE id = @id`,
      )
      .run({
        id,
        status: result.status,
        output_json: result.output ? JSON.stringify(result.output) : null,
        stdout_path: result.stdout_path ?? null,
        stderr_path: result.stderr_path ?? null,
        duration_ms: result.duration_ms ?? null,
        updated_at: new Date().toISOString(),
      });
  }

  listByGeneration(generation_id: string): RunRecord[] {
    const rows = this.dbService.db
      .prepare('SELECT * FROM run_records WHERE generation_id = ? ORDER BY created_at DESC')
      .all(generation_id) as RunRow[];
    return rows.map(rowToRun);
  }
}
