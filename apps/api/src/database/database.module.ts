import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { DEFAULT_METADATA_DB_PATH } from '../common/workspace';

/**
 * Provides a single SQLite connection. Path is configurable via
 * METADATA_DB_PATH (defaults to workspace/metadata.db); tests inject a
 * DatabaseService(':memory:') directly.
 */
@Module({
  providers: [
    {
      provide: DatabaseService,
      useFactory: () => {
        const dbPath = process.env.METADATA_DB_PATH ?? DEFAULT_METADATA_DB_PATH;
        return new DatabaseService(dbPath);
      },
    },
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
