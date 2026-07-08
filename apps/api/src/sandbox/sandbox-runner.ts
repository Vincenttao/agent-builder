import type {
  JobType,
  SandboxRuntime,
  SandboxJobStatus,
  NetworkPolicy,
  ResourceLimits,
} from '@agent-builder/shared-contracts';

/** A sandbox execution request (architecture §5.6, runtime_and_sandbox §5). */
export interface SandboxRunRequest {
  generationId: string;
  versionId?: string | null;
  jobType: JobType;
  /** argv — never a shell string (architecture §12, security §10.3). */
  command: string[];
  /** Project dir mounted as /workspace (or used as cwd in the mock runner). */
  workspacePath: string;
  image?: string;
  networkPolicy?: NetworkPolicy;
  resourceLimits?: ResourceLimits;
  /** Secrets injected only when listed in ENV_ALLOWLIST. */
  envAllowlist?: Record<string, string>;
  timeoutSeconds?: number;
  /** Requested runtime; SandboxService falls back to mock if unavailable. */
  runtime?: SandboxRuntime;
}

export interface SandboxRunResult {
  jobId: string;
  runtime: SandboxRuntime;
  status: SandboxJobStatus;
  exitCode: number | null;
  stdoutPath: string;
  stderrPath: string;
  durationMs: number;
  /** True when the mock fallback was used (no container isolation). */
  mock: boolean;
}

/** A pluggable sandbox execution backend. */
export interface SandboxRunner {
  readonly runtime: SandboxRuntime;
  /** Whether this runner can actually execute in the current environment. */
  isAvailable(): boolean;
  run(req: SandboxRunRequest, jobId: string, logDir: string): Promise<SandboxRunResult>;
}
