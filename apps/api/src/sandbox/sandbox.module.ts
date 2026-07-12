import { Module } from '@nestjs/common';
import { GenerationsModule } from '../generations/generations.module';
import { SandboxService, RUNS_DIR_TOKEN } from './sandbox.service';
import { MockSandboxRunner } from './mock-sandbox-runner';
import { DockerSandboxRunner } from './docker-sandbox-runner';
import { DiagnosticsController } from './diagnostics.controller';
import { RUNS_DIR } from '../common/workspace';

@Module({
  // GenerationsModule exports EventService + SandboxJobRepository.
  imports: [GenerationsModule],
  controllers: [DiagnosticsController],
  providers: [
    { provide: RUNS_DIR_TOKEN, useValue: RUNS_DIR },
    SandboxService,
    MockSandboxRunner,
    DockerSandboxRunner,
  ],
  exports: [SandboxService],
})
export class SandboxModule {}
