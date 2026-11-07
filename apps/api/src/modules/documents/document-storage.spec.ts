import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as filesystem from 'node:fs/promises';
import { mkdtemp, mkdir, readdir, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DocumentStorage } from './document-storage';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, open: vi.fn(actual.open) };
});

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'unslop-storage-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('Private original storage', () => {
  it('retains the original across storage restarts with private filesystem permissions', async () => {
    const path = join(root, 'documents');
    const publicPath = join(root, 'uploads');
    const storage = new DocumentStorage(path, publicPath);
    await storage.onModuleInit();
    const key = `${randomUUID()}.docx`;
    const bytes = Buffer.from('original bytes');
    await storage.write(key, bytes);
    expect((await stat(join(path, key))).mode & 0o777).toBe(0o600);
    const restarted = new DocumentStorage(path, publicPath);
    await restarted.onModuleInit();
    expect(await restarted.read(key, bytes.length)).toEqual(bytes);
  });

  it.each(['inside', 'same', 'parent', 'symlink'])('refuses a %s overlap with public uploads', async (kind) => {
    const publicPath = join(root, 'uploads');
    await mkdir(publicPath);
    const privatePath =
      kind === 'inside'
        ? join(publicPath, 'documents')
        : kind === 'same'
          ? publicPath
          : kind === 'parent'
            ? root
            : join(root, 'link');
    if (kind === 'symlink') await symlink(publicPath, privatePath);
    await expect(new DocumentStorage(privatePath, publicPath).onModuleInit()).rejects.toThrow('separate');
  });

  it('refuses symlinks and truncated originals instead of serving another file', async () => {
    const storage = new DocumentStorage(join(root, 'private'), join(root, 'public'));
    await storage.onModuleInit();
    const key = `${randomUUID()}.docx`;
    await storage.write(key, Buffer.from('original'));
    await expect(storage.read(key, 99)).rejects.toThrow();
    const linkedKey = `${randomUUID()}.docx`;
    await symlink(join(root, 'private', key), join(root, 'private', linkedKey));
    await expect(storage.read(linkedKey, 8)).rejects.toThrow();
    await expect(storage.read('../original.docx', 8)).rejects.toThrow();
  });
  it('refuses the website public assets and built browser directories', async () => {
    for (const directory of ['assets', 'browser']) {
      const publicPath = join(root, directory);
      const storage = new DocumentStorage(join(publicPath, 'documents'), join(root, 'uploads'), [publicPath]);
      await expect(storage.onModuleInit()).rejects.toThrow('separate');
    }
  });
  it('removes a partially written original if writing fails', async () => {
    const storage = new DocumentStorage(join(root, 'private'), join(root, 'public'));
    await storage.onModuleInit();
    const { open } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(filesystem.open).mockImplementationOnce(async (path, flags, mode) => {
      const file = await open(path, flags, mode);
      vi.spyOn(file, 'writeFile').mockImplementationOnce(async () => {
        await file.write(Buffer.from('partial'));
        throw new Error('Disk full');
      });
      return file;
    });
    await expect(storage.write(`${randomUUID()}.docx`, Buffer.from('complete original'))).rejects.toThrow();
    expect(await readdir(join(root, 'private'))).toEqual([]);
  });

  it('never overwrites or removes an existing original on a storage-key collision', async () => {
    const storage = new DocumentStorage(join(root, 'private'), join(root, 'public'));
    await storage.onModuleInit();
    const key = `${randomUUID()}.docx`;
    await storage.write(key, Buffer.from('original'));
    await expect(storage.write(key, Buffer.from('replacement'))).rejects.toThrow();
    expect(await storage.read(key, 8)).toEqual(Buffer.from('original'));
  });
});
