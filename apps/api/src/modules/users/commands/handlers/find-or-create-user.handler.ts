import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WelcomeUserEvent } from '../../events';
import { Role } from '@api/modules/roles/entities';
import { User } from '../../entities';
import { mapUserRoles } from '../../helpers';
import { IUserResponse } from '../../interfaces';
import { FindOrCreateUser } from '../impl';

@CommandHandler(FindOrCreateUser)
export class FindOrCreateUserHandler implements ICommandHandler<FindOrCreateUser, IUserResponse> {
  constructor(
    @InjectRepository(User) private readonly repository: Repository<User>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    private readonly eventBus: EventBus
  ) {}

  async execute({ identity }: FindOrCreateUser): Promise<IUserResponse> {
    if (!identity.subject || !identity.email || identity.emailVerified !== true) {
      throw new UnauthorizedException('A verified Google email and subject are required');
    }
    const existing = await this.repository.findOne({
      where: { googleSubject: identity.subject },
      relations: { roles: true }
    });
    const user =
      existing ??
      this.repository.create({
        googleSubject: identity.subject,
        name: identity.name,
        roles: [await this.roles.findOneByOrFail({ name: 'user' })]
      });
    user.email = identity.email.toLowerCase();
    user.googleEmailVerified = true;
    user.avatar ||= identity.avatar;
    const saved = await this.repository.save(
      existing
        ? { id: user.id, email: user.email, googleEmailVerified: user.googleEmailVerified, avatar: user.avatar }
        : user
    );
    if (!existing) this.eventBus.publish(new WelcomeUserEvent(saved));
    const current = existing ? await this.repository.findOneOrFail({ where: { id: saved.id } }) : saved;
    return mapUserRoles(current);
  }
}
