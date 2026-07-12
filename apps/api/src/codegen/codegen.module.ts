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
      // requireReal + allowFallback default from env; OpenCodeEngine also takes
      // TemplateEngine + SandboxService. P3: OPENCODE_ALLOW_FALLBACK=false makes
      // a missing opencode binary a hard failure (no silent template fallback).
      provide: OpenCodeEngine,
      useFactory: (templateEngine: TemplateEngine, sandboxService: SandboxService) =>
        new OpenCodeEngine(
          templateEngine,
          sandboxService,
          process.env.OPENCODE_REQUIRE_REAL === 'true',
          process.env.OPENCODE_ALLOW_FALLBACK !== 'false',
        ),
      inject: [TemplateEngine, SandboxService],
    },
    CodeGenerationService,
  ],
  exports: [CodeGenerationService, TemplateEngine, MockEngine, OpenCodeEngine],
})
export class CodeGenerationModule {}
