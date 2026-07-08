import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { GenerationsController } from './generations.controller';
import { GenerationService } from './generation.service';
import { EventService } from './event.service';
import { GenerationRepository } from './repositories/generation.repository';
import { EventRepository } from './repositories/event.repository';
import { VersionRepository } from './repositories/version.repository';
import { RunRepository } from './repositories/run.repository';
import { SandboxJobRepository } from './repositories/sandbox.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [GenerationsController],
  providers: [
    GenerationService,
    EventService,
    GenerationRepository,
    EventRepository,
    VersionRepository,
    RunRepository,
    SandboxJobRepository,
  ],
  exports: [GenerationService, EventService, VersionRepository, RunRepository, SandboxJobRepository],
})
export class GenerationsModule {}
