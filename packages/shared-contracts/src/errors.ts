/**
 * Unified error codes (PRD FR-012 / architecture Phase 6 §10.3).
 * User-facing messages live at the API layer; these codes are the stable contract.
 */
export enum ErrorCode {
  PromptParseFailed = 'PROMPT_PARSE_FAILED',
  SpecValidationFailed = 'SPEC_VALIDATION_FAILED',
  OpenjiuwenApiUnavailable = 'OPENJIUWEN_API_UNAVAILABLE',
  CodeGenerationFailed = 'CODE_GENERATION_FAILED',
  TestFailed = 'TEST_FAILED',
  RunFailed = 'RUN_FAILED',
  ExportFailed = 'EXPORT_FAILED',
}

export interface ApiErrorResponse {
  error_code: ErrorCode | string;
  message: string;
}

export class AgentBuilderError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AgentBuilderError';
  }

  toResponse(): ApiErrorResponse {
    return { error_code: this.code, message: this.message };
  }
}
