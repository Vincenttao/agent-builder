import { Module } from '@nestjs/common';
import { TemplateEngine } from './template-engine';
import { MockEngine } from './mock-engine';
import { OpenCodeEngine } from './opencode-engine';
import { CodeGenerationService } from './codegen.service';

@Module({
  providers: [
    TemplateEngine,
    MockEngine,
    {
      // requireReal defaults from env; OpenCodeEngine also takes TemplateEngine.
      provide: OpenCodeEngine,
      useFactory: (templateEngine: TemplateEngine) =>
        new OpenCodeEngine(templateEngine, process.env.OPENCODE_REQUIRE_REAL === 'true'),
      inject: [TemplateEngine],
    },
    CodeGenerationService,
  ],
  exports: [CodeGenerationService, TemplateEngine, MockEngine, OpenCodeEngine],
})
export class CodeGenerationModule {}
