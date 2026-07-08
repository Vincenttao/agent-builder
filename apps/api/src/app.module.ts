import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';

/**
 * Root application module.
 *
 * P0 composes (added incrementally across phases):
 *  - HealthModule            (Phase 0)
 *  - DatabaseModule          (Phase 1) — SQLite metadata
 *  - GenerationsModule       (Phase 1+6) — lifecycle + REST/SSE
 *  - SpecModule              (Phase 2) — parser + validator
 *  - SandboxModule           (Phase 3)
 *  - CodeGenerationModule    (Phase 4)
 *  - ExportsModule           (Phase 6)
 */
@Module({
  imports: [HealthModule],
})
export class AppModule {}
