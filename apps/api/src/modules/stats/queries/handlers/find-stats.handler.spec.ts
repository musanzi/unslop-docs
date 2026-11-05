import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from '@api/modules/users/entities';
import { FindStatsHandler } from './find-stats.handler';

describe('FindStatsHandler', () => {
  const userCount = vi.fn();
  const roleCount = vi.fn();
  let handler: FindStatsHandler;

  beforeEach(async () => {
    userCount.mockReset().mockResolvedValue(23);
    roleCount.mockReset().mockResolvedValue(4);
    const module = await Test.createTestingModule({
      providers: [
        FindStatsHandler,
        {
          provide: DataSource,
          useValue: { getRepository: (entity: unknown) => ({ count: entity === User ? userCount : roleCount }) }
        }
      ]
    }).compile();
    handler = module.get(FindStatsHandler);
  });

  it('labels the independent user and role totals correctly', async () => {
    await expect(handler.execute()).resolves.toEqual([
      { label: 'Utilisateurs', total: 23 },
      { label: 'Rôles', total: 4 }
    ]);
  });

  it('preserves zero totals', async () => {
    userCount.mockResolvedValue(0);
    roleCount.mockResolvedValue(0);
    await expect(handler.execute()).resolves.toEqual([
      { label: 'Utilisateurs', total: 0 },
      { label: 'Rôles', total: 0 }
    ]);
  });

  it.each(['users', 'roles'])('fails without returning partial statistics when counting %s fails', async (entity) => {
    (entity === 'users' ? userCount : roleCount).mockRejectedValue(new Error('count failed'));
    await expect(handler.execute()).rejects.toThrow('Statistiques introuvables');
  });
});
