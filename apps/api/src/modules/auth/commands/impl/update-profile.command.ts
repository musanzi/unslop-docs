import { Command } from '@nestjs/cqrs';
import { UpdateProfileDto } from '../../dto';
import { IUserResponse } from '@api/modules/users/interfaces';

export class UpdateProfile extends Command<IUserResponse> {
  constructor(
    public readonly currentUser: IUserResponse,
    public readonly updateUserDto: UpdateProfileDto
  ) {
    super();
  }
}
