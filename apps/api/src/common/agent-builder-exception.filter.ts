import { Catch, ExceptionFilter, ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { AgentBuilderError, type ApiErrorResponse } from '@agent-builder/shared-contracts';

/**
 * Maps domain errors to stable, user-facing 400 responses with error_code +
 * message (PRD FR-012). The detailed stack is logged server-side only.
 *
 * Test-failure (TEST_FAILED) and run-failure (RUN_FAILED) are also 400 here —
 * they originate from synchronous validation paths in the create/run flow; the
 * long-running async pipeline surfaces failures via SSE Error events instead.
 */
@Catch(AgentBuilderError)
export class AgentBuilderExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AgentBuilderExceptionFilter.name);

  catch(exception: AgentBuilderError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const body: ApiErrorResponse = exception.toResponse();

    this.logger.warn(`${body.error_code}: ${body.message}`);
    if (exception.cause) {
      this.logger.debug(exception.cause);
    }

    response.status(HttpStatus.BAD_REQUEST).json(body);
  }
}
