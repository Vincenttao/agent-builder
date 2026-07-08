import {
  GenerationStatus,
  GENERATION_STATUSES,
  TERMINAL_STATUSES,
  isGenerationStatus,
  isGenerationType,
  isTerminalStatus,
  canTransition,
} from './generation';

describe('GenerationStatus (PRD §7.1 / architecture §11)', () => {
  it('exposes exactly the six P0 lifecycle states in lifecycle order', () => {
    expect(GENERATION_STATUSES).toEqual([
      GenerationStatus.Pending,
      GenerationStatus.Planning,
      GenerationStatus.Generating,
      GenerationStatus.Testing,
      GenerationStatus.Completed,
      GenerationStatus.Failed,
    ]);
  });

  it('uses PRD string values', () => {
    expect(GenerationStatus.Pending).toBe('pending');
    expect(GenerationStatus.Planning).toBe('planning');
    expect(GenerationStatus.Generating).toBe('generating');
    expect(GenerationStatus.Testing).toBe('testing');
    expect(GenerationStatus.Completed).toBe('completed');
    expect(GenerationStatus.Failed).toBe('failed');
  });

  it('classifies terminal states', () => {
    expect(isTerminalStatus(GenerationStatus.Completed)).toBe(true);
    expect(isTerminalStatus(GenerationStatus.Failed)).toBe(true);
    expect(isTerminalStatus(GenerationStatus.Testing)).toBe(false);
    expect(TERMINAL_STATUSES).toEqual([GenerationStatus.Completed, GenerationStatus.Failed]);
  });

  it('guards status values', () => {
    expect(isGenerationStatus('completed')).toBe(true);
    expect(isGenerationStatus('bogus')).toBe(false);
    expect(isGenerationStatus(undefined)).toBe(false);
  });

  it('guards generation type values', () => {
    expect(isGenerationType('agent')).toBe(true);
    expect(isGenerationType('workflow')).toBe(true);
    expect(isGenerationType('skill')).toBe(false); // P0 has no Skills creation (PRD §4.2)
  });
});

describe('canTransition (architecture §5.2 — failed must not overwrite completed)', () => {
  it('allows forward happy-path transitions', () => {
    expect(canTransition(GenerationStatus.Pending, GenerationStatus.Planning)).toBe(true);
    expect(canTransition(GenerationStatus.Planning, GenerationStatus.Generating)).toBe(true);
    expect(canTransition(GenerationStatus.Generating, GenerationStatus.Testing)).toBe(true);
    expect(canTransition(GenerationStatus.Testing, GenerationStatus.Completed)).toBe(true);
  });

  it('allows transition to failed from any state', () => {
    for (const from of GENERATION_STATUSES) {
      expect(canTransition(from, GenerationStatus.Failed)).toBe(true);
    }
  });

  it('forbids skipping lifecycle steps', () => {
    expect(canTransition(GenerationStatus.Pending, GenerationStatus.Completed)).toBe(false);
    expect(canTransition(GenerationStatus.Pending, GenerationStatus.Testing)).toBe(false);
  });

  it('forbids leaving terminal completed state', () => {
    expect(canTransition(GenerationStatus.Completed, GenerationStatus.Testing)).toBe(false);
    expect(canTransition(GenerationStatus.Completed, GenerationStatus.Generating)).toBe(false);
  });
});
