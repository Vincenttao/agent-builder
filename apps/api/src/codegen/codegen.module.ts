import { Module } from '@nestjs/common';
import { TemplateEngine } from './template-engine';
import { MockEngine } from './mock-engine';
import { OpenCodeEngine } from './opencode-engine';
import { CodeGenerationService } from './codegen.service';
import { SandboxModule } from '../sandbox/sandbox.module';
import { SandboxService } from '../sandbox/sandbox.service';

@Module({
  imports: [SandboxModule],
  providers: [
    TemplateEngine,
    MockEngine,
    {
      // requireReal defaults from env; OpenCodeEngine also takes TemplateEngine + SandboxService.
      provide: OpenCodeEngine,
      useFactory: (templateEngine: TemplateEngine, sandboxService: SandboxService) =>
        new OpenCodeEngine(templateEngine, sandboxService, process.env.OPENCODE_REQUIRE_REAL === 'true'),
      inject: [TemplateEngine, SandboxService],
    },
    CodeGenerationService,
  ],
  exports: [CodeGenerationService, TemplateEngine, MockEngine, OpenCodeEngine],
})
export class CodeGenerationModule {}
