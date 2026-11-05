import { IEvent } from '@nestjs/cqrs';
import { User } from '@api/modules/users/entities';

export class ResetPasswordRequestedEvent implements IEvent {
  constructor(
    public readonly user: Pick<User, 'name' | 'email'>,
    public readonly link: string
  ) {}
}
