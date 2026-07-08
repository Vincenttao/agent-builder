import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../../database/database.service';
import type { ProjectVersion } from '@agent-builder/shared-contracts';
import { TestStatus } from '@agent-builder/shared-contracts';

interface VersionRow {
  id: string;
  generation_id: string;
  version_label: string;
  summary: string;
  project_path: string;
  file_count: number;
  test_status: string;
  mock_mode: number;
  created_at: string;
}

function rowToVersion(row: VersionRow): ProjectVersion {
  return {
    id: row.id,
    generation_id: row.generation_id,
    version_label: row.version_label,
    summary: row.summary,
    project_path: row.project_path,
    file_count: row.file_count,
    test_status: row.test_status as TestStatus,
    mock_mode: row.mock_mode === 1,
    created_at: row.created_at,
  };
}

export interface CreateVersionInput {
  generation_id: string;
  version_label: string;
  summary: string;
  project_path: string;
  file_count: number;
  test_status: TestStatus;
  mock_mode: boolean;
}

@Injectable()
export class VersionRepository {
  constructor(private readonly dbService: DatabaseService) {}

  newId(): string {
    return `ver_${uuidv4()}`;
  }

  create(input: CreateVersionInput & { id: string }): ProjectVersion {
    const created_at = new Date().toISOString();
    this.dbService.db
      .prepare(
        `INSERT INTO project_versions
          (id, generation_id, version_label, summary, project_path, file_count, test_status, mock_mode, created_at)
          VALUES (@id, @generation_id, @version_label, @summary, @project_path, @file_count, @test_status, @mock_mode, @created_at)`,
      )
      .run({
        ...input,
        mock_mode: input.mock_mode ? 1 : 0,
        created_at,
      });
    return this.getById(input.id)!;
  }

  getById(id: string): ProjectVersion | null {
    const row = this.dbService.db
      .prepare('SELECT * FROM project_versions WHERE id = ?')
      .get(id) as VersionRow | undefined;
    return row ? rowToVersion(row) : null;
  }

  updateTestStatus(id: string, test_status: TestStatus): void {
    this.dbService.db
      .prepare('UPDATE project_versions SET test_status = ? WHERE id = ?')
      .run(test_status, id);
  }

  listByGeneration(generation_id: string): ProjectVersion[] {
    const rows = this.dbService.db
      .prepare('SELECT * FROM project_versions WHERE generation_id = ? ORDER BY created_at DESC')
      .all(generation_id) as VersionRow[];
    return rows.map(rowToVersion);
  }
}
