import { Module } from '@nestjs/common';
import { UsersController } from './controllers';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatusChange, User } from './entities';
import { RolesModule } from '../roles';
import { Role } from '../roles/entities';
import { CommandHandlers } from './commands/handlers';
import { QueryHandlers } from './queries/handlers';
import { EventHandlers } from './events/handlers';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, StatusChange]), RolesModule],
  controllers: [UsersController],
  providers: [...CommandHandlers, ...QueryHandlers, ...EventHandlers]
})
export class UsersModule {}
