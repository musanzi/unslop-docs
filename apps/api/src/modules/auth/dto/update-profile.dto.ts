import { PickType } from '@nestjs/swagger';
import { UpdateUserDto } from '@api/modules/users/dto';

export class UpdateProfileDto extends PickType(UpdateUserDto, ['name', 'email'] as const) {}
