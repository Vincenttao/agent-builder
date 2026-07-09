import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../../database/database.service';
import type { AgentSpec, WorkflowSpec } from '@agent-builder/shared-contracts';

export interface SaveSpecInput {
  generation_id: string;
  spec: AgentSpec | WorkflowSpec;
  parser_mode: string;
  provider: string | null;
  model: string | null;
  prompt_hash: string | null;
  validation_status: string;
}

export interface PersistedSpec {
  generation_id: string;
  spec: AgentSpec | WorkflowSpec;
  parser_mode: string;
  provider: string | null;
  model: string | null;
  prompt_hash: string | null;
  validation_status: string;
  created_at: string;
}

interface SpecRow {
  id: string;
  generation_id: string;
  draft_id: string | null;
  spec_json: string;
  parser_mode: string;
  provider: string | null;
  model: string | null;
  prompt_hash: string | null;
  validation_status: string;
  created_at: string;
}

function rowToPersisted(row: SpecRow): PersistedSpec {
  return {
    generation_id: row.generation_id,
    spec: JSON.parse(row.spec_json) as AgentSpec | WorkflowSpec,
    parser_mode: row.parser_mode,
    provider: row.provider,
    model: row.model,
    prompt_hash: row.prompt_hash,
    validation_status: row.validation_status,
    created_at: row.created_at,
  };
}

/**
 * Persists the parsed Spec for a generation (Phase 9 §5.7 / §9 note 1-3).
 *
 * getSpec(id) must NOT re-parse user_prompt — a real LLM is non-deterministic,
 * so re-parsing could yield a different Spec for the same generation. One Spec
 * per generation (UNIQUE on generation_id); save is an idempotent upsert so a
 * retry/re-run does not create duplicates or re-invoke the LLM (test #9).
 */
@Injectable()
export class SpecRepository {
  constructor(private readonly dbService: DatabaseService) {}

  newId(): string {
    return `spec_${uuidv4()}`;
  }

  save(input: SaveSpecInput): void {
    const created_at = new Date().toISOString();
    this.dbService.db
      .prepare(
        `INSERT INTO generation_specs
          (id, generation_id, draft_id, spec_json, parser_mode, provider, model, prompt_hash, validation_status, created_at)
          VALUES (@id, @generation_id, NULL, @spec_json, @parser_mode, @provider, @model, @prompt_hash, @validation_status, @created_at)
          ON CONFLICT(generation_id) DO UPDATE SET
            spec_json = excluded.spec_json,
            parser_mode = excluded.parser_mode,
            provider = excluded.provider,
            model = excluded.model,
            prompt_hash = excluded.prompt_hash,
            validation_status = excluded.validation_status,
            created_at = excluded.created_at`,
      )
      .run({
        id: this.newId(),
        generation_id: input.generation_id,
        spec_json: JSON.stringify(input.spec),
        parser_mode: input.parser_mode,
        provider: input.provider,
        model: input.model,
        prompt_hash: input.prompt_hash,
        validation_status: input.validation_status,
        created_at,
      });
  }

  getByGeneration(generation_id: string): PersistedSpec | null {
    const row = this.dbService.db
      .prepare('SELECT * FROM generation_specs WHERE generation_id = ?')
      .get(generation_id) as SpecRow | undefined;
    return row ? rowToPersisted(row) : null;
  }
}
