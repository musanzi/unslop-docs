import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StatusChange, User } from '../../entities';
import { StatusChangeResponse } from '../../interfaces/status-change-response';
import { FindStatusChanges } from '../impl/find-status-changes.query';

@QueryHandler(FindStatusChanges)
export class FindStatusChangesHandler implements IQueryHandler<FindStatusChanges, StatusChangeResponse[]> {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(StatusChange) private readonly changes: Repository<StatusChange>
  ) {}

  async execute({ userId }: FindStatusChanges): Promise<StatusChangeResponse[]> {
    if (!(await this.users.existsBy({ id: userId }))) throw new NotFoundException('User not found');
    return this.changes.find({ where: { userId }, order: { createdAt: 'DESC', id: 'DESC' } });
  }
}
