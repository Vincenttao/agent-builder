import { Injectable } from '@nestjs/common';
import type { AgentSpec, WorkflowSpec } from '@agent-builder/shared-contracts';
import type { CodeGenerationEngine, EngineName, GenerationContext, GenerationResult, GenerationCallbacks } from './engine';
import { TemplateEngine } from './template-engine';
import { MockEngine } from './mock-engine';
import { OpenCodeEngine } from './opencode-engine';

/**
 * Selects a CodeGenerationEngine and delegates (architecture §5.5).
 * Default: TemplateEngine (deterministic P0 fallback). 'opencode' / 'mock'
 * are configurable (P0 plan §8.4 checkpoint #4).
 */
@Injectable()
export class CodeGenerationService {
  constructor(
    private readonly templateEngine: TemplateEngine,
    private readonly mockEngine: MockEngine,
    private readonly opencodeEngine: OpenCodeEngine,
  ) {}

  getEngine(name?: EngineName): CodeGenerationEngine {
    switch (name) {
      case 'opencode':
        return this.opencodeEngine;
      case 'mock':
        return this.mockEngine;
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
