import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // The Next.js dev server (3000) and production runtime call the API cross-origin.
  app.enableCors({ origin: true, credentials: true });

  // Request validation is handled per-handler by ZodValidationPipe against the
  // zod schemas in @agent-builder/shared-contracts (single source of truth).

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port);
  console.log(`agent-builder-api listening on :${port}`);
}

bootstrap().catch((err) => {
  console.error('Failed to boot agent-builder-api', err);
  process.exit(1);
});
