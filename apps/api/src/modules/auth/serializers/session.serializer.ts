import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportSerializer } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@api/modules/users/entities';
import { mapUserRoles } from '@api/modules/users/helpers';
import { IUserResponse } from '@api/modules/users/interfaces';

@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(
    @InjectRepository(User) private readonly repository: Repository<User>,
    private readonly config: ConfigService
  ) {
    super();
  }

  serializeUser(user: IUserResponse, done: (err: Error | null, id?: string) => void) {
    done(null, user.id);
  }

  async deserializeUser(id: string, done: (err: Error | null, user?: IUserResponse | false) => void) {
    try {
      const user = await this.repository.findOne({ where: { id }, relations: { roles: true } });
      if (!user?.googleSubject || user.googleEmailVerified !== true) {
        done(null, false);
        return;
      }
      done(null, mapUserRoles(user, this.config.getOrThrow<string>('ADMIN_EMAIL')));
    } catch (error) {
      done(error as Error);
    }
  }
}
