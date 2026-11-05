import { BadRequestException, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities';
import { IUserResponse } from '../../interfaces';
import { FindUserById } from '../../queries';
import { UpdateUser } from '../impl';

@CommandHandler(UpdateUser)
export class UpdateUserHandler implements ICommandHandler<UpdateUser, IUserResponse> {
  private readonly logger = new Logger(UpdateUserHandler.name);

  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
    private readonly queryBus: QueryBus
  ) {}

  async execute(command: UpdateUser): Promise<IUserResponse> {
    const { name, avatar } = command.updateUserDto;

    try {
      if (!command.id) throw new BadRequestException('Utilisateur introuvable');

      const user = await this.repository.findOneOrFail({ where: { id: command.id } });

      const newUser = this.repository.merge(user, {
        name,
        avatar
      });

      const updatedUser = await this.repository.save(newUser);

      return await this.queryBus.execute(new FindUserById(updatedUser.id));
    } catch (error) {
      this.logger.error(
        `Update user failed id="${command.id}": ${error instanceof Error ? error.message : String(error)}`
      );
      throw new BadRequestException('Mise à jour impossible');
    }
  }
}
