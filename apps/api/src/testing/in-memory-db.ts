import { DatabaseService } from '../database/database.service';

/** Fresh in-memory SQLite for unit tests — isolated per call, no workspace files. */
export function createInMemoryDb(): DatabaseService {
  return new DatabaseService(':memory:');
}
