import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Alice Student' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'avatar.png' })
  @IsOptional()
  @IsString()
  avatar?: string;
}
