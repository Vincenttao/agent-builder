import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../../database/database.service';
import type { GenerationEvent } from '@agent-builder/shared-contracts';

interface EventRow {
  id: string;
  generation_id: string;
  run_id: string | null;
  type: string;
  message: string;
  payload_json: string;
  sequence: number;
  created_at: string;
}

function rowToEvent(row: EventRow): GenerationEvent {
  return {
    id: row.id,
    generation_id: row.generation_id,
    run_id: row.run_id,
    type: row.type,
    message: row.message,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    sequence: row.sequence,
    created_at: row.created_at,
  };
}

export interface RecordEventInput {
  generation_id: string;
  type: string;
  message: string;
  payload?: Record<string, unknown>;
  run_id?: string | null;
}

@Injectable()
export class EventRepository {
  constructor(private readonly dbService: DatabaseService) {}

  private readonly insertStmt = this.dbService.db.prepare(
    `INSERT INTO generation_events
      (id, generation_id, run_id, type, message, payload_json, sequence, created_at)
      VALUES (@id, @generation_id, @run_id, @type, @message, @payload_json, @sequence, @created_at)`,
  );

  private readonly nextSeqStmt = this.dbService.db.prepare(
    'SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM generation_events WHERE generation_id = ?',
  );

  private readonly getByIdStmt = this.dbService.db.prepare(
    'SELECT * FROM generation_events WHERE id = ?',
  );

  private readonly listStmt = this.dbService.db.prepare(
    'SELECT * FROM generation_events WHERE generation_id = ? AND sequence > ? ORDER BY sequence ASC',
  );

  private readonly countStmt = this.dbService.db.prepare(
    'SELECT COUNT(*) AS n FROM generation_events WHERE generation_id = ?',
  );

  /** Per-generation monotonically-increasing sequence, assigned atomically. */
  insert(input: RecordEventInput): GenerationEvent {
    const id = `evt_${uuidv4()}`;
    const created_at = new Date().toISOString();
    const assign = this.dbService.db.transaction(() => {
      const { next } = this.nextSeqStmt.get(input.generation_id) as { next: number };
      this.insertStmt.run({
        id,
        generation_id: input.generation_id,
        run_id: input.run_id ?? null,
        type: input.type,
        message: input.message,
        payload_json: JSON.stringify(input.payload ?? {}),
        sequence: next,
        created_at,
      });
      return next;
    });
    assign();
    return rowToEvent(this.getByIdStmt.get(id) as EventRow);
  }

  /** Events after `afterSequence` in sequence order — SSE replay uses afterSequence=0. */
  listByGeneration(generation_id: string, afterSequence = 0): GenerationEvent[] {
    const rows = this.listStmt.all(generation_id, afterSequence) as EventRow[];
    return rows.map(rowToEvent);
  }

  count(generation_id: string): number {
    return (this.countStmt.get(generation_id) as { n: number }).n;
  }
}
