import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { GenerationsModule } from './generations/generations.module';
import { SandboxModule } from './sandbox/sandbox.module';
import { CodeGenerationModule } from './codegen/codegen.module';

/**
 * Root application module.
 *
 * P0 composes (added incrementally across phases):
 *  - HealthModule            (Phase 0)
 *  - GenerationsModule       (Phase 1+2+6) — lifecycle, events, spec, REST/SSE
 *  - SandboxModule           (Phase 3) — task-level sandbox execution
 *  - CodeGenerationModule    (Phase 4) — Template / OpenCode / Mock engines
 */
@Module({
  imports: [HealthModule, GenerationsModule, SandboxModule, CodeGenerationModule],
})
export class AppModule {}
