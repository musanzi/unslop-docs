import { Command } from '@nestjs/cqrs';
import { IUserResponse } from '../../interfaces';
import { UserStatus } from '../../user-status';

export class UpdateStatus extends Command<IUserResponse> {
  constructor(
    public readonly userId: string,
    public readonly status: UserStatus,
    public readonly admin: IUserResponse
  ) {
    super();
  }
}
