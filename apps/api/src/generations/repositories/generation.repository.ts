import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../../database/database.service';
import type { Generation } from '@agent-builder/shared-contracts';
import { GenerationStatus, GenerationType } from '@agent-builder/shared-contracts';

interface GenerationRow {
  id: string;
  type: string;
  title: string;
  user_prompt: string;
  status: string;
  selected_model: string;
  mode: string;
  active_version_id: string | null;
  project_root: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

function rowToGeneration(row: GenerationRow): Generation {
  return {
    id: row.id,
    type: row.type as GenerationType,
    title: row.title,
    user_prompt: row.user_prompt,
    status: row.status as GenerationStatus,
    selected_model: row.selected_model,
    mode: row.mode,
    active_version_id: row.active_version_id,
    project_root: row.project_root,
    error_code: row.error_code,
    error_message: row.error_message,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface InsertGenerationInput {
  type: GenerationType;
  title: string;
  user_prompt: string;
  status: GenerationStatus;
  selected_model: string;
  mode: string;
}

@Injectable()
export class GenerationRepository {
  constructor(private readonly dbService: DatabaseService) {}

  newId(): string {
    return `gen_${uuidv4()}`;
  }

  insert(input: InsertGenerationInput & { id: string }): Generation {
    const now = new Date().toISOString();
    this.dbService.db
      .prepare(
        `INSERT INTO generations
          (id, type, title, user_prompt, status, selected_model, mode, active_version_id, project_root, error_code, error_message, created_at, updated_at)
          VALUES (@id, @type, @title, @user_prompt, @status, @selected_model, @mode, NULL, NULL, NULL, NULL, @created_at, @updated_at)`,
      )
      .run({
        id: input.id,
        type: input.type,
        title: input.title,
        user_prompt: input.user_prompt,
        status: input.status,
        selected_model: input.selected_model,
        mode: input.mode,
        created_at: now,
        updated_at: now,
      });
    return this.getById(input.id)!;
  }

  getById(id: string): Generation | null {
    const row = this.dbService.db
      .prepare('SELECT * FROM generations WHERE id = ?')
      .get(id) as GenerationRow | undefined;
    return row ? rowToGeneration(row) : null;
  }

  updateStatus(id: string, status: GenerationStatus): void {
    this.dbService.db
      .prepare(
        "UPDATE generations SET status = ?, updated_at = ? WHERE id = ?",
      )
      .run(status, new Date().toISOString(), id);
  }

  updateTitle(id: string, title: string): void {
    this.dbService.db
      .prepare('UPDATE generations SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, new Date().toISOString(), id);
  }

  setActiveVersion(id: string, versionId: string, projectRoot: string | null): void {
    this.dbService.db
      .prepare(
        'UPDATE generations SET active_version_id = ?, project_root = COALESCE(?, project_root), updated_at = ? WHERE id = ?',
      )
      .run(versionId, projectRoot, new Date().toISOString(), id);
  }

  markFailed(id: string, errorCode: string, errorMessage: string): void {
    // NOTE: never overwrite active_version_id here (PRD FR-012 / architecture §5.2).
    this.dbService.db
      .prepare(
        'UPDATE generations SET status = ?, error_code = ?, error_message = ?, updated_at = ? WHERE id = ?',
      )
      .run(GenerationStatus.Failed, errorCode, errorMessage, new Date().toISOString(), id);
  }

  markCompleted(id: string): void {
    this.dbService.db
      .prepare(
        "UPDATE generations SET status = ?, error_code = NULL, error_message = NULL, updated_at = ? WHERE id = ?",
      )
      .run(GenerationStatus.Completed, new Date().toISOString(), id);
  }

  list(filter?: { status?: string; limit?: number; offset?: number }): Generation[] {
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;
    if (filter?.status) {
      const rows = this.dbService.db
        .prepare('SELECT * FROM generations WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(filter.status, limit, offset) as GenerationRow[];
      return rows.map(rowToGeneration);
    }
    const rows = this.dbService.db
      .prepare('SELECT * FROM generations ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(limit, offset) as GenerationRow[];
    return rows.map(rowToGeneration);
  }
}
