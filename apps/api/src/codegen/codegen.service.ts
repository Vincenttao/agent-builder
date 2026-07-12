import { Injectable } from '@nestjs/common';
import type { AgentSpec, WorkflowSpec } from '@agent-builder/shared-contracts';
import type { CodeGenerationEngine, EngineName, GenerationContext, GenerationResult, GenerationCallbacks } from './engine';
import { TemplateEngine } from './template-engine';
import { OpenCodeEngine } from './opencode-engine';

/**
 * Selects a CodeGenerationEngine and delegates (architecture §5.5).
 * Default: TemplateEngine (deterministic local generator). 'opencode' runs the
 * real OpenCode path.
 */
@Injectable()
export class CodeGenerationService {
  constructor(
    private readonly templateEngine: TemplateEngine,
    private readonly opencodeEngine: OpenCodeEngine,
  ) {}

  getEngine(name?: EngineName): CodeGenerationEngine {
    switch (name) {
      case 'opencode':
        return this.opencodeEngine;
      case 'template':
      default:
        return this.templateEngine;
    }
  }

  async generate(
    spec: AgentSpec | WorkflowSpec,
    context: GenerationContext,
    callbacks?: GenerationCallbacks,
    engineName?: EngineName,
  ): Promise<GenerationResult> {
    return this.getEngine(engineName).generate(spec, context, callbacks);
  }
}
