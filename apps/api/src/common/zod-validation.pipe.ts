import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import type { ZodTypeAny } from 'zod';
import { ApiErrorResponse } from '@agent-builder/shared-contracts';

/**
 * Validates an inbound payload against a zod schema defined in
 * @agent-builder/shared-contracts — the single source of truth for request
 * shapes. Failed validation surfaces a stable, user-facing error.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue
        ? `${firstIssue.path.join('.') || 'body'}: ${firstIssue.message}`
        : '请求参数校验失败';
      const body: ApiErrorResponse = {
        error_code: 'SPEC_VALIDATION_FAILED',
        message,
      };
      throw new BadRequestException(body);
    }
    return result.data;
  }
}
