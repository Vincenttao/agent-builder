import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // The Next.js dev server (3000) and production runtime call the API cross-origin.
  app.enableCors({ origin: true, credentials: true });

  // DTOs use class-validator-style shared contracts; reject unknown payloads.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port);
  console.log(`agent-builder-api listening on :${port}`);
}

bootstrap().catch((err) => {
  console.error('Failed to boot agent-builder-api', err);
  process.exit(1);
});
