import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { workerSettings, DeepSeekProvider, loadAssessmentSkill } from './modules/documents/deepseek-provider';
import { DocumentStorage } from './modules/documents/document-storage';
import { DocumentJobs } from './modules/processing/document-jobs';
import { AssessmentWorker } from './modules/processing/assessment-worker';

async function main(): Promise<void> {
  process.env.LANGCHAIN_TRACING = '';
  process.env.LANGCHAIN_TRACING_V2 = 'false';
  process.env.LANGSMITH_TRACING = 'false';
  process.env.LANGCHAIN_VERBOSE = 'false';
  let settings: ReturnType<typeof workerSettings>;
  try {
    settings = workerSettings(process.env);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Invalid worker settings.'}\n`);
    process.exitCode = 1;
    return;
  }
  const database = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [join(__dirname, 'modules/**/*.entity.js')],
    synchronize: false,
    logging: false,
    extra: { connectionTimeoutMillis: 5000, statement_timeout: 5000 }
  });
  const shutdown = new AbortController();
  const stop = () => shutdown.abort();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    const skill = await loadAssessmentSkill();
    const storage = new DocumentStorage();
    await storage.onModuleInit();
    await database.initialize();
    const worker = new AssessmentWorker(
      new DocumentJobs(database),
      storage,
      new DeepSeekProvider(settings),
      skill,
      settings
    );
    process.stdout.write('Assessment worker started.\n');
    while (!shutdown.signal.aborted) {
      try {
        await worker.runOnce(shutdown.signal);
      } catch {
        process.stderr.write('Assessment worker could not update durable job state.\n');
      }
      await setTimeout(1000, undefined, { signal: shutdown.signal }).catch(() => {});
    }
  } catch {
    process.stderr.write('Assessment worker startup failed. Check database, private storage, and pinned rules.\n');
    process.exitCode = 1;
  } finally {
    if (database.isInitialized) await database.destroy();
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
  }
}

void main().catch(() => {
  process.stderr.write('Assessment worker stopped unexpectedly.\n');
  process.exitCode = 1;
});
