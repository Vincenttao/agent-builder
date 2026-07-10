import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AgentBuilderExceptionFilter } from './common/agent-builder-exception.filter';

const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: false,
    logger: ['debug', 'log', 'warn', 'error', 'verbose'],
  });
  app.enableShutdownHooks();

  // The Next.js dev server (3000) and production runtime call the API cross-origin.
  app.enableCors({ origin: true, credentials: true });

  // Map domain errors (PROMPT_PARSE_FAILED, SPEC_VALIDATION_FAILED, …) to
  // stable 400 responses. Request-shape validation is handled per-handler by
  // ZodValidationPipe against the zod schemas in @agent-builder/shared-contracts.
  app.useGlobalFilters(new AgentBuilderExceptionFilter());

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port);
  console.log(`agent-builder-api listening on :${port}`);
}

bootstrap().catch((err) => {
  console.error('Failed to boot agent-builder-api', err);
  process.exit(1);
});
