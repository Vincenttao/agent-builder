import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { GenerationsModule } from './generations/generations.module';

/**
 * Root application module.
 *
 * P0 composes (added incrementally across phases):
 *  - HealthModule            (Phase 0)
 *  - GenerationsModule       (Phase 1+6) — lifecycle, events, REST/SSE, files, runs, exports
 *  - SpecModule              (Phase 2) — parser + validator
 *  - SandboxModule           (Phase 3)
 *  - CodeGenerationModule    (Phase 4)
 */
@Module({
  imports: [HealthModule, GenerationsModule],
})
export class AppModule {}
