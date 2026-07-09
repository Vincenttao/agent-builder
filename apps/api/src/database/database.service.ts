import Database from 'better-sqlite3';
import { Injectable, Logger } from '@nestjs/common';
import type { Database as DatabaseType } from 'better-sqlite3';
import { SCHEMA_SQL } from './schema';
import { DEFAULT_METADATA_DB_PATH, ensureWorkspaceDirs } from '../common/workspace';

/**
 * Thin wrapper around better-sqlite3 (synchronous, Redis not needed for metadata).
 * Phase 1 owner of all five entity tables. Use `:memory:` in tests.
 *
 * Migrations run in the constructor (not onModuleInit) so that repositories,
 * which prepare statements in their own constructors, see the tables.
 */
@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly _db: DatabaseType;

  constructor(dbPath: string = DEFAULT_METADATA_DB_PATH) {
    if (dbPath !== ':memory:') {
      ensureWorkspaceDirs();
    }
    this._db = new Database(dbPath);
    // WAL for concurrent readers; foreign_keys pragma is on for any FK declarations
    // added later. Core integrity (failed never overwrites completed version) is
    // enforced at the service layer (GenerationService.markFailed), not via FK.
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('foreign_keys = ON');
    this.migrate();
  }

  migrate(): void {
    const tx = this._db.transaction(() => {
      for (const stmt of SCHEMA_SQL) {
        try {
          this._db.exec(stmt);
        } catch (e) {
          // ALTER TABLE ADD COLUMN throws if the column already exists — safe to ignore.
          const msg = (e as Error).message;
          if (msg.includes('duplicate column name') || msg.includes('already exists')) {
            this.logger.debug(`migration skip: ${msg}`);
            continue;
          }
          throw e;
        }
      }
    });
    tx();
    this.logger.log(`Database migrated (${SCHEMA_SQL.length} statements).`);
  }

  get db(): DatabaseType {
    return this._db;
  }

  close(): void {
    this._db.close();
  }
}
