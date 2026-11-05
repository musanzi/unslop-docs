import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StatusChange, User } from '../../entities';
import { mapUserRoles } from '../../helpers';
import { IUserResponse } from '../../interfaces';
import { UpdateStatus } from '../impl/update-status.command';

@CommandHandler(UpdateStatus)
export class UpdateStatusHandler implements ICommandHandler<UpdateStatus, IUserResponse> {
  constructor(@InjectRepository(User) private readonly repository: Repository<User>) {}

  async execute({ userId, status, admin }: UpdateStatus): Promise<IUserResponse> {
    if (!admin.isAdmin) throw new ForbiddenException();

    return this.repository.manager.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const user = await users.findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!user) throw new NotFoundException('User not found');
      if (user.status === status) return mapUserRoles(user);

      const changes = manager.getRepository(StatusChange);
      const change = changes.create({
        userId,
        adminId: admin.id,
        adminEmail: admin.email,
        previousStatus: user.status,
        newStatus: status
      });
      await users.update(userId, { status });
      await changes.save(change);
      const updated = await users.findOneByOrFail({ id: userId });
      return mapUserRoles(updated);
    });
  }
}
