import { Module } from '@nestjs/common';
import { TemplateEngine } from './template-engine';
import { OpenCodeEngine } from './opencode-engine';
import { CodeGenerationService } from './codegen.service';
import { SandboxModule } from '../sandbox/sandbox.module';
import { SandboxService } from '../sandbox/sandbox.service';

@Module({
  imports: [SandboxModule],
  providers: [
    TemplateEngine,
    {
      // P4: requireReal + allowFallback from env. Fallback defaults to false
      // (fail loud) — must explicitly opt in with OPENCODE_ALLOW_FALLBACK=true.
      provide: OpenCodeEngine,
      useFactory: (templateEngine: TemplateEngine, sandboxService: SandboxService) =>
        new OpenCodeEngine(
          templateEngine,
          sandboxService,
          process.env.OPENCODE_REQUIRE_REAL === 'true',
          process.env.OPENCODE_ALLOW_FALLBACK === 'true',
        ),
      inject: [TemplateEngine, SandboxService],
    },
    CodeGenerationService,
  ],
  exports: [CodeGenerationService, TemplateEngine, OpenCodeEngine],
})
export class CodeGenerationModule {}
