import { Module } from '@nestjs/common';
import { RolesController } from './controllers';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities';
import { QueryHandlers } from './queries/handlers';

@Module({
  imports: [TypeOrmModule.forFeature([Role])],
  controllers: [RolesController],
  providers: [...QueryHandlers]
})
export class RolesModule {}
