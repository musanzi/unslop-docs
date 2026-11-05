import { ChatDeepSeek } from '@langchain/deepseek';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AssessmentProvider } from './assessment-workflow';

export function workerSettings(env: NodeJS.ProcessEnv) {
  const required = (key: string) => {
    const value = env[key]?.trim();
    if (!value) throw new Error(`${key} is required for the assessment worker.`);
    return value;
  };
  const duration = (key: string, fallback: number) => {
    const value = env[key] === undefined ? fallback : Number(env[key]);
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2147483647)
      throw new Error(`${key} must be a positive integer no greater than 2147483647.`);
    return value;
  };
  return {
    apiKey: required('DEEPSEEK_API_KEY'),
    model: required('DEEPSEEK_MODEL'),
    processingTimeoutMs: duration('PROCESSING_TIMEOUT_MS', 15 * 60 * 1000),
    providerTimeoutMs: duration('DEEPSEEK_TIMEOUT_MS', 60 * 1000)
  };
}

export async function loadAssessmentSkill(): Promise<string> {
  let root = __dirname;
  while (!existsSync(join(root, 'vendor/cursor-pstack-unslop/SKILL.md'))) {
    const parent = dirname(root);
    if (parent === root) throw new Error('Pinned assessment rules are missing.');
    root = parent;
  }
  const bytes = await readFile(join(root, 'vendor/cursor-pstack-unslop/SKILL.md'));
  if (
    createHash('sha256').update(bytes).digest('hex') !==
    'ccab208e315ce05e2fab8eeee2f7879f1289b5c6844840b2d307adf31c79144f'
  )
    throw new Error('Pinned assessment rules failed integrity validation.');
  return bytes.toString('utf8');
}

export class DeepSeekProvider implements AssessmentProvider {
  private readonly model: ChatDeepSeek;

  constructor(settings: ReturnType<typeof workerSettings>, fetcher?: typeof fetch) {
    this.model = new ChatDeepSeek({
      apiKey: settings.apiKey,
      model: settings.model,
      maxRetries: 0,
      timeout: settings.providerTimeoutMs,
      maxTokens: 4096,
      streaming: false,
      verbose: false,
      configuration: { maxRetries: 0, logLevel: 'off', ...(fetcher ? { fetch: fetcher } : {}) }
    });
  }

  async assess(system: string, text: string, signal?: AbortSignal): Promise<unknown> {
    try {
      const result = await this.model.invoke(
        [new SystemMessage(system), new HumanMessage(JSON.stringify({ document: text }))],
        { signal, response_format: { type: 'json_object' }, maxRetries: 0 }
      );
      if (typeof result.content !== 'string' || result.response_metadata['finish_reason'] !== 'stop')
        throw new Error('Incomplete assessment');
      return JSON.parse(result.content);
    } catch {
      throw new Error('Assessment provider failed');
    }
  }
}
