import { Module } from '@nestjs/common';
import { AuthController } from './controllers';
import { LocalStrategy, GoogleStrategy } from './strategies';
import { UsersModule } from '../users';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from '../roles/entities';
import { User } from '../users/entities';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { CommandHandlers } from './commands/handlers';
import { QueryHandlers } from './queries/handlers';
import { EventHandlers } from './events/handlers';
import { SessionSerializer } from './serializers';

@Module({
  imports: [UsersModule, TypeOrmModule.forFeature([User, Role]), PassportModule, JwtModule],
  controllers: [AuthController],
  providers: [LocalStrategy, GoogleStrategy, SessionSerializer, ...CommandHandlers, ...QueryHandlers, ...EventHandlers]
})
export class AuthModule {}
