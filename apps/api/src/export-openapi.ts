import { NestFactory } from '@nestjs/core';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { AppModule } from './app.module';
import { createOpenApiDocument } from './shared/helpers/create-openapi-document';

async function exportOpenApi(): Promise<void> {
  // Preview mode scans metadata without opening database, Redis, or SMTP connections.
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });

  try {
    const output = resolve('libs/api-contracts/openapi.json');
    const document = createOpenApiDocument(app);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(document, null, 2) + '\n');
  } finally {
    await app.close();
  }
}

exportOpenApi().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
