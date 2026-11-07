import { join, resolve } from 'node:path';

export function getUploadsPath(...segments: string[]): string {
  return join(resolve(process.env.UPLOADS_DIR || 'uploads'), ...segments);
}
