/** Sandbox job entity + enums (architecture §7.5, runtime_and_sandbox §5). */

export enum JobType {
  OpencodeGeneration = 'opencode_generation',
  SmokeTest = 'smoke_test',
  AgentRun = 'agent_run',
  WorkflowRun = 'workflow_run',
  ExportCheck = 'export_check',
}

export enum SandboxRuntime {
  Docker = 'docker',
  Podman = 'podman',
  Gvisor = 'gvisor',
  E2b = 'e2b',
  Mock = 'mock', // local subprocess fallback when no container runtime is available
}

export enum NetworkPolicy {
  None = 'none',
  OpenjiuwenOnly = 'openjiuwen_only',
  Controlled = 'controlled',
}

export enum SandboxJobStatus {
  Pending = 'pending',
  Running = 'running',
  Success = 'success',
  Failed = 'failed',
  Timeout = 'timeout',
  Killed = 'killed',
}

export interface ResourceLimits {
  cpus: number;
  memory: string;
  pids_limit: number;
}

export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  cpus: 1,
  memory: '1g',
  pids_limit: 256,
};

export interface SandboxJob {
  id: string;
  generation_id: string;
  version_id: string | null;
  job_type: JobType;
  runtime: SandboxRuntime;
  image: string;
  /** Command argv — never a shell string (architecture §12, security §10.3). */
  command: string[];
  network_policy: NetworkPolicy;
  cpus: number;
  memory: string;
  pids_limit: number;
  status: SandboxJobStatus;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  stdout_path: string | null;
  stderr_path: string | null;
}
