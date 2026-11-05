import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { promises } from 'fs';
import { basename } from 'node:path';
import { getUploadsPath } from '@api/shared/config';
import { IUserResponse } from '../../interfaces';
import { UploadUserAvatar } from '../impl';
import { Repository } from 'typeorm';
import { User } from '../../entities';
import { InjectRepository } from '@nestjs/typeorm';
import { FindUserById } from '../../queries';

@CommandHandler(UploadUserAvatar)
export class UploadUserAvatarHandler implements ICommandHandler<UploadUserAvatar, IUserResponse> {
  private readonly logger = new Logger(UploadUserAvatarHandler.name);

  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
    private readonly queryBus: QueryBus
  ) {}

  async execute(command: UploadUserAvatar): Promise<IUserResponse> {
    const { userId, file } = command;
    if (!file?.filename) throw new BadRequestException('Image requise');

    let avatarSaved = false;

    try {
      if (!userId) throw new NotFoundException('Utilisateur introuvable');

      const previousAvatar = await this.repository.manager.transaction(async (manager) => {
        const repository = manager.getRepository(User);
        const user = await repository.findOne({
          where: { id: userId },
          lock: { mode: 'pessimistic_write' }
        });

        if (!user) throw new NotFoundException('Utilisateur introuvable');

        await repository.update(user.id, { avatar: file.filename });
        return user.avatar;
      });
      avatarSaved = true;

      if (previousAvatar !== file.filename) await this.removeLocalAvatar(previousAvatar);

      return await this.queryBus.execute(new FindUserById(userId));
    } catch (error) {
      if (!avatarSaved) await this.removeLocalAvatar(file.filename);

      if (error instanceof NotFoundException) throw error;

      this.logger.error(
        `Upload user avatar failed id="${userId}": ${error instanceof Error ? error.message : String(error)}`
      );
      throw new BadRequestException("Ajout d'image impossible");
    }
  }

  private async removeLocalAvatar(filename: string): Promise<void> {
    if (
      !filename ||
      filename === '.' ||
      filename === '..' ||
      basename(filename) !== filename ||
      filename.includes('\\')
    ) {
      return;
    }

    try {
      await promises.rm(getUploadsPath('profiles', filename), { force: true });
    } catch (error) {
      this.logger.warn(
        `Avatar cleanup failed file="${filename}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
