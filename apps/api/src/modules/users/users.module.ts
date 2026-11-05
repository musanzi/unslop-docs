import { Module } from '@nestjs/common';
import { UsersController } from './controllers';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities';
import { RolesModule } from '../roles';
import { UserSubscriber } from './subscribers';
import { Role } from '../roles/entities';
import { CommandHandlers } from './commands/handlers';
import { QueryHandlers } from './queries/handlers';
import { EventHandlers } from './events/handlers';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role]), RolesModule],
  controllers: [UsersController],
  providers: [UserSubscriber, ...CommandHandlers, ...QueryHandlers, ...EventHandlers]
})
export class UsersModule {}
