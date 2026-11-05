import { Module } from '@nestjs/common';
import { AuthController } from './controllers';
import { GoogleStrategy } from './strategies';
import { UsersModule } from '../users';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from '../roles/entities';
import { User } from '../users/entities';
import { PassportModule } from '@nestjs/passport';
import { CommandHandlers } from './commands/handlers';
import { QueryHandlers } from './queries/handlers';
import { SessionSerializer } from './serializers';

@Module({
  imports: [UsersModule, TypeOrmModule.forFeature([User, Role]), PassportModule],
  controllers: [AuthController],
  providers: [GoogleStrategy, SessionSerializer, ...CommandHandlers, ...QueryHandlers]
})
export class AuthModule {}
