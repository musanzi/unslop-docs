import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'editor' })
  @IsNotEmpty({ message: 'Le nom du rôle est obligatoire' })
  name: string;
}
