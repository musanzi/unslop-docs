import { IEvent } from '@nestjs/cqrs';
import { User } from '@api/modules/users/entities';

type WelcomeUser = Pick<User, 'name' | 'email'>;

export class WelcomeUserEvent implements IEvent {
  constructor(
    public readonly user: WelcomeUser,
    public readonly defaultPassword?: string
  ) {}
}
