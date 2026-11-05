import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  avatar?: string;

  @ApiPropertyOptional({ example: 'newSecret123' })
  password?: string;
}
