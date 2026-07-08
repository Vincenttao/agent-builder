import type { AgentSpec, WorkflowSpec } from '@agent-builder/shared-contracts';

export type EngineName = 'template' | 'opencode' | 'mock';

/** Per-generation context handed to every engine (architecture §5.5). */
export interface GenerationContext {
  generationId: string;
  versionId: string;
  /** Absolute path the engine must write to: workspace/generated/{gen}/{ver} */
  projectPath: string;
  mock: boolean;
}

export interface GeneratedFile {
  /** Project-relative path (matches the path in file_created events). */
  path: string;
  size: number;
}

export interface GenerationResult {
  engine: EngineName;
  projectPath: string;
  files: GeneratedFile[];
  warnings: string[];
  mock: boolean;
}

/** Callbacks the orchestrator wires to EventService. */
export interface GenerationCallbacks {
  onFile?: (file: GeneratedFile) => void;
  onEvent?: (type: string, message: string, payload?: Record<string, unknown>) => void;
}

/**
 * CodeGenerationEngine — the pluggable extension point (architecture §5.5).
 * Template / OpenCode / Mock all implement this. Templates consume only the
 * Spec — never the raw prompt (P0 plan §6.5 note 3).
 */
export interface CodeGenerationEngine {
  readonly name: EngineName;
  generate(
    spec: AgentSpec | WorkflowSpec,
    context: GenerationContext,
    callbacks?: GenerationCallbacks,
  ): Promise<GenerationResult>;
}
