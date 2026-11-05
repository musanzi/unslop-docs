import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '@api/shared/dto';

export class FilterUsersDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'john' })
  @IsOptional()
  @IsString()
  q?: string;
}
