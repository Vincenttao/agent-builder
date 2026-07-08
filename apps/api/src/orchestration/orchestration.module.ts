import { Module } from '@nestjs/common';
import { GenerationsModule } from '../generations/generations.module';
import { SandboxModule } from '../sandbox/sandbox.module';
import { CodeGenerationModule } from '../codegen/codegen.module';
import { OrchestratorService } from './orchestrator.service';
import { RunService } from './run.service';
import { ExportService } from './export.service';
import { OrchestratorController, ExportsController } from './orchestrator.controller';

@Module({
  // GenerationService/EventService/repos from GenerationsModule; SandboxService;
  // CodeGenerationService. No cycle — GenerationsModule does not import this module.
  imports: [GenerationsModule, SandboxModule, CodeGenerationModule],
  controllers: [OrchestratorController, ExportsController],
  providers: [OrchestratorService, RunService, ExportService],
  exports: [OrchestratorService, RunService, ExportService],
})
export class OrchestrationModule {}
