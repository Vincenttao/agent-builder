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
