import { Command } from '@nestjs/cqrs';
import { User } from '@api/modules/users/entities';
import { IUserResponse } from '@api/modules/users/interfaces';
import { UpdatePasswordDto } from '../../dto';

export class UpdatePassword extends Command<IUserResponse> {
  constructor(
    public readonly currentUser: User,
    public readonly updatePasswordDto: UpdatePasswordDto
  ) {
    super();
  }
}
