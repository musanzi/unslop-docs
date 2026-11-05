import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { promises } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userFixture } from '@api/shared/testing/fixtures';
import { User } from '../../entities';
import { UploadUserAvatar } from '../impl';
import { UploadUserAvatarHandler } from './upload-user-avatar.handler';

describe('UploadUserAvatarHandler', () => {
  const user = userFixture({ avatar: 'old.png' });
  const file = { filename: 'new.png' } as Express.Multer.File;
  const findOne = vi.fn();
  const update = vi.fn();
  const execute = vi.fn();
  const repository = { findOne, update };
  const transaction = vi.fn(async (work: (manager: { getRepository: () => typeof repository }) => Promise<unknown>) =>
    work({ getRepository: () => repository })
  );
  let handler: UploadUserAvatarHandler;

  beforeEach(async () => {
    vi.stubEnv('UPLOADS_DIR', '/test/uploads');
    vi.spyOn(promises, 'rm').mockResolvedValue(undefined);
    findOne.mockReset().mockResolvedValue(user);
    update.mockReset().mockResolvedValue({ affected: 1 });
    execute.mockReset().mockResolvedValue({ ...user, avatar: file.filename });
    transaction.mockReset().mockImplementation(async (work) => work({ getRepository: () => repository }));
    const module = await Test.createTestingModule({
      providers: [
        UploadUserAvatarHandler,
        { provide: getRepositoryToken(User), useValue: { manager: { transaction } } },
        { provide: QueryBus, useValue: { execute } }
      ]
    }).compile();
    handler = module.get(UploadUserAvatarHandler);
  });

  it('saves the new avatar and removes the old local avatar after a successful transaction', async () => {
    await expect(handler.execute(new UploadUserAvatar(user.id, file))).resolves.toMatchObject({ avatar: 'new.png' });
    expect(update).toHaveBeenCalledWith(user.id, { avatar: 'new.png' });
    expect(promises.rm).toHaveBeenCalledExactlyOnceWith('/test/uploads/profiles/old.png', { force: true });
  });

  it('rejects an absent file before starting a transaction', async () => {
    await expect(handler.execute(new UploadUserAvatar(user.id, undefined))).rejects.toThrow(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
    expect(promises.rm).not.toHaveBeenCalled();
  });

  it('removes the uploaded file when the user ID is absent', async () => {
    await expect(handler.execute(new UploadUserAvatar('', file))).rejects.toThrow(NotFoundException);
    expect(transaction).not.toHaveBeenCalled();
    expect(promises.rm).toHaveBeenCalledExactlyOnceWith('/test/uploads/profiles/new.png', { force: true });
  });

  it('removes the uploaded file and preserves not-found errors for an absent account', async () => {
    findOne.mockResolvedValue(null);
    await expect(handler.execute(new UploadUserAvatar(user.id, file))).rejects.toThrow(NotFoundException);
    expect(update).not.toHaveBeenCalled();
    expect(promises.rm).toHaveBeenCalledExactlyOnceWith('/test/uploads/profiles/new.png', { force: true });
    expect(execute).not.toHaveBeenCalled();
  });

  it('removes only the new file after a failed write', async () => {
    update.mockRejectedValue(new Error('write failed'));
    await expect(handler.execute(new UploadUserAvatar(user.id, file))).rejects.toThrow("Ajout d'image impossible");
    expect(promises.rm).toHaveBeenCalledExactlyOnceWith('/test/uploads/profiles/new.png', { force: true });
    expect(execute).not.toHaveBeenCalled();
  });

  it('removes the new file if commit fails after the update', async () => {
    transaction.mockImplementation(async (work) => {
      await work({ getRepository: () => repository });
      throw new Error('commit failed');
    });
    await expect(handler.execute(new UploadUserAvatar(user.id, file))).rejects.toThrow(BadRequestException);
    expect(promises.rm).toHaveBeenCalledExactlyOnceWith('/test/uploads/profiles/new.png', { force: true });
  });

  it('keeps a committed avatar when refreshing the user fails', async () => {
    execute.mockRejectedValue(new Error('refresh failed'));
    await expect(handler.execute(new UploadUserAvatar(user.id, file))).rejects.toThrow(BadRequestException);
    expect(promises.rm).toHaveBeenCalledExactlyOnceWith('/test/uploads/profiles/old.png', { force: true });
  });

  it.each([
    null,
    '.',
    '..',
    '../other.png',
    'folder/other.png',
    'folder\\other.png',
    'https://example.com/avatar.png',
    'new.png'
  ])('does not remove an unsafe, remote, absent, or unchanged previous avatar: %s', async (avatar) => {
    findOne.mockResolvedValue(userFixture({ avatar }));
    await handler.execute(new UploadUserAvatar(user.id, file));
    expect(promises.rm).not.toHaveBeenCalled();
  });

  it('still returns the updated user when old-avatar cleanup fails', async () => {
    vi.mocked(promises.rm).mockRejectedValue(new Error('permission denied'));
    await expect(handler.execute(new UploadUserAvatar(user.id, file))).resolves.toMatchObject({ avatar: 'new.png' });
  });

  it('preserves the original failure when cleanup of a rejected upload also fails', async () => {
    findOne.mockResolvedValue(null);
    vi.mocked(promises.rm).mockRejectedValue(new Error('permission denied'));
    await expect(handler.execute(new UploadUserAvatar(user.id, file))).rejects.toThrow(NotFoundException);
  });
});
