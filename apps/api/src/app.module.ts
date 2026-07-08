import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { GenerationsModule } from './generations/generations.module';
import { SandboxModule } from './sandbox/sandbox.module';
import { CodeGenerationModule } from './codegen/codegen.module';
import { OrchestrationModule } from './orchestration/orchestration.module';

/**
 * Root application module.
 *  - HealthModule        (Phase 0)
 *  - GenerationsModule   (Phase 1+2) — lifecycle, events, spec, GET/SSE
 *  - SandboxModule       (Phase 3) — task-level sandbox execution
 *  - CodeGenerationModule(Phase 4) — Template / OpenCode / Mock engines
 *  - OrchestrationModule (Phase 6) — pipeline + POST/files/runs/exports
 */
@Module({
  imports: [HealthModule, GenerationsModule, SandboxModule, CodeGenerationModule, OrchestrationModule],
})
export class AppModule {}
