import { BadRequestException, Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IUserResponse } from '@api/modules/users/interfaces';
import { UpdateUser } from '@api/modules/users/commands';
import { UpdateProfile } from '../impl';

@CommandHandler(UpdateProfile)
export class UpdateProfileHandler implements ICommandHandler<UpdateProfile, IUserResponse> {
  private readonly logger = new Logger(UpdateProfileHandler.name);

  constructor(private readonly commandBus: CommandBus) {}

  async execute(command: UpdateProfile): Promise<IUserResponse> {
    const { currentUser, updateUserDto } = command;
    const { name, email } = updateUserDto;

    try {
      return await this.commandBus.execute(new UpdateUser(currentUser.id, { name, email }));
    } catch (error) {
      this.logger.error(
        `Update profile failed id="${currentUser?.id ?? ''}": ${error instanceof Error ? error.message : String(error)}`
      );
      throw new BadRequestException('Requête invalide');
    }
  }
}
