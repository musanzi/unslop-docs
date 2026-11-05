import { BadRequestException, Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { DataSource } from 'typeorm';
import { Role } from '@api/modules/roles/entities';
import { User } from '@api/modules/users/entities';
import { IStatItem } from '../../interfaces';
import { FindStats } from '../impl';

@QueryHandler(FindStats)
export class FindStatsHandler implements IQueryHandler<FindStats, IStatItem[]> {
  private readonly logger = new Logger(FindStatsHandler.name);

  constructor(private readonly dataSource: DataSource) {}

  async execute(): Promise<IStatItem[]> {
    try {
      const [usersTotal, rolesTotal] = await Promise.all([
        this.dataSource.getRepository(User).count(),
        this.dataSource.getRepository(Role).count()
      ]);

      return [
        { label: 'Utilisateurs', total: usersTotal },
        { label: 'Rôles', total: rolesTotal }
      ];
    } catch (error) {
      this.logger.error(`Find stats failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException('Statistiques introuvables');
    }
  }
}
