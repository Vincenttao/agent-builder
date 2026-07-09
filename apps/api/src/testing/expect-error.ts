import { AgentBuilderError, type ErrorCode } from '@agent-builder/shared-contracts';

/** Assert that `fn` throws an AgentBuilderError with the expected stable code. */
export function expectAgentBuilderError(
  fn: () => unknown,
  code: ErrorCode,
): AgentBuilderError {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(AgentBuilderError);
  const err = caught as AgentBuilderError;
  expect(err.code).toBe(code);
  return err;
}

/** Async variant for promises that reject with an AgentBuilderError. */
export async function expectAgentBuilderErrorAsync(
  fn: () => Promise<unknown>,
  code: ErrorCode,
): Promise<AgentBuilderError> {
  let caught: unknown;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(AgentBuilderError);
  const err = caught as AgentBuilderError;
  expect(err.code).toBe(code);
  return err;
}
