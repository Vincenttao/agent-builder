/**
 * Generation lifecycle types shared across the Agent Builder monorepo.
 *
 * Mirrors PRD §7.1 and architecture §7.1 / §11 (task lifecycle):
 *   pending -> planning -> generating -> testing -> completed
 *   any state -> failed
 */

/** The six P0 generation lifecycle states (PRD §7.1). */
export enum GenerationStatus {
  Pending = 'pending',
  Planning = 'planning',
  Generating = 'generating',
  Testing = 'testing',
  Completed = 'completed',
  Failed = 'failed',
}

/** Ordered list of statuses — declaration order matches the happy-path lifecycle. */
export const GENERATION_STATUSES: readonly GenerationStatus[] = Object.values(
  GenerationStatus,
) as readonly GenerationStatus[];

/** The two P0 generation object types (PRD §1). */
export enum GenerationType {
  Agent = 'agent',
  Workflow = 'workflow',
}

export function isGenerationStatus(value: unknown): value is GenerationStatus {
  return (
    typeof value === 'string' &&
    (GENERATION_STATUSES as readonly string[]).includes(value)
  );
}

export function isGenerationType(value: unknown): value is GenerationType {
  return value === GenerationType.Agent || value === GenerationType.Workflow;
}

/** Terminal states — once reached, the generation no longer transitions. */
export const TERMINAL_STATUSES: readonly GenerationStatus[] = [
  GenerationStatus.Completed,
  GenerationStatus.Failed,
] as const;

export function isTerminalStatus(status: GenerationStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * A generation is allowed to move to `failed` from any state, but a `failed`
 * generation must never overwrite a previously `completed` version
 * (architecture §5.2, PRD FR-012). This helper encodes the legal transitions.
 */
export function canTransition(from: GenerationStatus, to: GenerationStatus): boolean {
  if (from === to) return true;
  if (to === GenerationStatus.Failed) return true;
  const order = GENERATION_STATUSES as readonly string[];
  const fromIdx = order.indexOf(from);
  const toIdx = order.indexOf(to);
  // Happy-path transitions only move forward along the lifecycle.
  return fromIdx >= 0 && toIdx >= 0 && toIdx === fromIdx + 1;
}
