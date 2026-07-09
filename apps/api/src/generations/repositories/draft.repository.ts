import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../../database/database.service';

export interface DraftRow {
  id: string;
  user_prompt: string;
  type: string;
  spec_json: string | null;
  parser_mode: string | null;
  provider: string | null;
  model: string | null;
  validation_status: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export interface CreateDraftInput {
  user_prompt: string;
  type: string;
}

export interface DraftEntity {
  id: string;
  user_prompt: string;
  type: string;
  spec: unknown | null;
  parser_mode: string | null;
  provider: string | null;
  model: string | null;
  validation_status: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

function rowToEntity(row: DraftRow): DraftEntity {
  return {
    id: row.id,
    user_prompt: row.user_prompt,
    type: row.type,
    spec: row.spec_json ? JSON.parse(row.spec_json) : null,
    parser_mode: row.parser_mode,
    provider: row.provider,
    model: row.model,
    validation_status: row.validation_status,
    status: row.status,
    error_message: row.error_message,
    created_at: row.created_at,
  };
}

@Injectable()
export class DraftRepository {
  constructor(private readonly dbService: DatabaseService) {}

  newId(): string {
    return `draft_${uuidv4()}`;
  }

  create(input: CreateDraftInput & { id: string }): DraftEntity {
    const created_at = new Date().toISOString();
    this.dbService.db
      .prepare(
        `INSERT INTO generation_drafts
          (id, user_prompt, type, spec_json, parser_mode, provider, model, validation_status, status, error_message, created_at)
          VALUES (@id, @user_prompt, @type, NULL, NULL, NULL, NULL, NULL, 'pending', NULL, @created_at)`,
      )
      .run({ id: input.id, user_prompt: input.user_prompt, type: input.type, created_at });
    return this.getById(input.id)!;
  }

  getById(id: string): DraftEntity | null {
    const row = this.dbService.db
      .prepare('SELECT * FROM generation_drafts WHERE id = ?')
      .get(id) as DraftRow | undefined;
    return row ? rowToEntity(row) : null;
  }

  setSpec(
    id: string,
    spec: unknown,
    meta: { parser_mode: string; provider: string; model: string | null },
    validation_status: string,
  ): void {
    this.dbService.db
      .prepare(
        `UPDATE generation_drafts
          SET spec_json = ?, parser_mode = ?, provider = ?, model = ?, validation_status = ?, status = 'parsed'
          WHERE id = ?`,
      )
      .run(JSON.stringify(spec), meta.parser_mode, meta.provider, meta.model, validation_status, id);
  }

  markFailed(id: string, errorMessage: string): void {
    this.dbService.db
      .prepare("UPDATE generation_drafts SET status = 'failed', error_message = ? WHERE id = ?")
      .run(errorMessage, id);
  }

  markConfirmed(id: string): void {
    this.dbService.db
      .prepare("UPDATE generation_drafts SET status = 'confirmed' WHERE id = ?")
      .run(id);
  }

  updateSpec(id: string, spec: unknown, validation_status: string): void {
    this.dbService.db
      .prepare(
        'UPDATE generation_drafts SET spec_json = ?, validation_status = ?, status = ? WHERE id = ?',
      )
      .run(JSON.stringify(spec), validation_status, validation_status === 'valid' ? 'parsed' : 'failed', id);
  }
}
