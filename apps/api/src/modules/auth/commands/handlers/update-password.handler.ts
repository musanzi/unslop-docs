import { BadRequestException, Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IUserResponse } from '@api/modules/users/interfaces';
import { UpdateUser } from '@api/modules/users/commands';
import { UpdatePassword } from '../impl';

@CommandHandler(UpdatePassword)
export class UpdatePasswordHandler implements ICommandHandler<UpdatePassword, IUserResponse> {
  private readonly logger = new Logger(UpdatePasswordHandler.name);

  constructor(private readonly commandBus: CommandBus) {}

  async execute(command: UpdatePassword): Promise<IUserResponse> {
    const { currentUser, updatePasswordDto } = command;
    const { password } = updatePasswordDto;

    try {
      return await this.commandBus.execute(new UpdateUser(currentUser.id, { password }));
    } catch (error) {
      this.logger.error(
        `Update password failed id="${currentUser?.id ?? ''}": ${error instanceof Error ? error.message : String(error)}`
      );
      throw new BadRequestException('Mise à jour impossible');
    }
  }
}
