/** Run record for an agent chat, workflow run, or smoke test (architecture §7.4). */
export enum RunType {
  SmokeTest = 'smoke_test',
  AgentChat = 'agent_chat',
  WorkflowRun = 'workflow_run',
}

export enum RunStatus {
  Pending = 'pending',
  Running = 'running',
  Success = 'success',
  Failed = 'failed',
  Timeout = 'timeout',
}

export interface RunRecord {
  id: string;
  generation_id: string;
  version_id: string | null;
  run_type: RunType;
  status: RunStatus;
  input_json: Record<string, unknown> | null;
  output_json: Record<string, unknown> | null;
  stdout_path: string | null;
  stderr_path: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

/** A single step in a ReAct trace (P4 M6). */
export interface RunTraceEvent {
  iteration: number;
  type: 'tool_call' | 'tool_result' | 'final' | 'error';
  tool?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  message?: string;
  duration_ms?: number;
}

/** Structured runner output (runtime_and_sandbox §11, architecture Phase 5 §9.3). */
export interface RunnerResult {
  status: 'success' | 'failed' | 'timeout';
  output: Record<string, unknown>;
  /** P4 M6: ReAct trace events (preferred over events for UI display). */
  trace?: RunTraceEvent[];
  events: Record<string, unknown>[];
}
