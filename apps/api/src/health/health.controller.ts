import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
}

const SERVICE_NAME = process.env.APP_NAME ?? 'agent-builder-api';
const SERVICE_VERSION = '0.1.0';

/**
 * Liveness probe for the NestJS orchestration backend.
 * Kept at the root path (not under /api) so platform health checks can reach
 * it without coupling to the business API prefix.
 */
@Controller()
export class HealthController {
  @Get('health')
  check(): HealthResponse {
    return HealthController.payload();
  }

  @Get('healthz')
  healthz(): HealthResponse {
    return HealthController.payload();
  }

  private static payload(): HealthResponse {
    return { status: 'ok', service: SERVICE_NAME, version: SERVICE_VERSION };
  }
}
