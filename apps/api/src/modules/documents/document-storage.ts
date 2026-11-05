import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { mkdir, open, realpath, rm } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { getUploadsPath } from '@api/shared/config';

function websiteDirectories(): string[] {
  let project = __dirname;
  while (!existsSync(join(project, 'package.json')) && dirname(project) !== project) project = dirname(project);
  return [join(project, 'apps/web/public'), join(project, 'dist/apps/web/browser')];
}

async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    return join(await canonicalPath(dirname(path)), basename(path));
  }
}

@Injectable()
export class DocumentStorage implements OnModuleInit {
  private readonly logger = new Logger(DocumentStorage.name);
  constructor(
    private readonly root = resolve(process.env.DOCUMENTS_DIR || 'private-documents'),
    private readonly publicRoot = getUploadsPath(),
    private readonly staticRoots = websiteDirectories()
  ) {}

  async onModuleInit(): Promise<void> {
    await mkdir(this.publicRoot, { recursive: true });
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const privatePath = await realpath(this.root);
    const publicPaths = await Promise.all(
      [this.publicRoot, ...this.staticRoots].map((path) => canonicalPath(resolve(path)))
    );
    const overlaps = (parent: string, child: string) => {
      const path = relative(parent, child);
      return path === '' || (!path.startsWith('..') && !isAbsolute(path));
    };
    if (publicPaths.some((publicPath) => overlaps(publicPath, privatePath) || overlaps(privatePath, publicPath))) {
      throw new Error('DOCUMENTS_DIR must be separate from UPLOADS_DIR and web static directories.');
    }
  }

  private path(key: string): string {
    if (!/^[0-9a-f-]{36}\.docx$/.test(key)) throw new Error('Invalid document storage key');
    return join(this.root, key);
  }

  async write(key: string, bytes: Buffer): Promise<void> {
    const file = await open(this.path(key), 'wx', 0o600);
    try {
      try {
        await file.writeFile(bytes);
        await file.sync();
      } finally {
        await file.close();
      }
      const directory = await open(this.root, 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } catch {
      try {
        await this.remove(key);
      } catch {
        this.logger.warn('Partial private upload cleanup failed.');
      }
      throw new Error('Unable to write private original');
    }
  }

  async read(key: string, size: number): Promise<Buffer> {
    const file = await open(this.path(key), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size !== size) throw new Error('Original unavailable');
      return await file.readFile();
    } finally {
      await file.close();
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}
