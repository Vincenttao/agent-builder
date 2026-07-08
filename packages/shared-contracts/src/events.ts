/**
 * Generation event protocol shared across backend, SSE wire, and frontend.
 *
 * The 12 PRD FR-005 event types are the core generation-lifecycle events.
 * The adapter events (architecture §6.2) are emitted by the OpenJiuwen /
 * OpenCode / sandbox / mock runtime boundaries and normalized into the same
 * stream.
 */

/** The union of all event types a client may observe on the SSE stream. */
export enum EventType {
  // --- PRD FR-005 lifecycle events ---
  Thought = 'thought',
  PlanCreated = 'plan_created',
  PlanUpdated = 'plan_updated',
  FileCreated = 'file_created',
  FileUpdated = 'file_updated',
  CommandStarted = 'command_started',
  CommandFinished = 'command_finished',
  TestStarted = 'test_started',
  TestFinished = 'test_finished',
  RunStarted = 'run_started',
  RunFinished = 'run_finished',
  Error = 'error',
  // --- adapter / runtime events (architecture §6.2) ---
  OpencodeStarted = 'opencode_started',
  OpencodeFileChanged = 'opencode_file_changed',
  OpencodeFinished = 'opencode_finished',
  SandboxStarted = 'sandbox_started',
  SandboxFinished = 'sandbox_finished',
  ToolStarted = 'tool_started',
  ToolFinished = 'tool_finished',
  NodeStarted = 'node_started',
  NodeFinished = 'node_finished',
  Output = 'output',
}

/** The 12 PRD FR-005 lifecycle events, in display order. */
export const PRD_LIFECYCLE_EVENTS: readonly EventType[] = [
  EventType.Thought,
  EventType.PlanCreated,
  EventType.PlanUpdated,
  EventType.FileCreated,
  EventType.FileUpdated,
  EventType.CommandStarted,
  EventType.CommandFinished,
  EventType.TestStarted,
  EventType.TestFinished,
  EventType.RunStarted,
  EventType.RunFinished,
  EventType.Error,
] as const;

/** A persisted generation event (architecture §7.2). */
export interface GenerationEvent {
  id: string;
  generation_id: string;
  run_id: string | null;
  type: EventType | string;
  message: string;
  /** JSON-serializable payload; kept open-ended so new event shapes don't need a schema migration (architecture §5.5). */
  payload: Record<string, unknown>;
  sequence: number;
  created_at: string; // ISO 8601
}

/** SSE wire format: `event:` carries the type, `data:` carries the event JSON. */
export interface SseMessage {
  event: string;
  data: GenerationEvent;
}
