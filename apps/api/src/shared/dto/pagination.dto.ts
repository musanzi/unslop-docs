import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 1, default: 1, example: 1, description: 'Page number (1-based)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
    description: 'Items per page. Takes precedence over take. Defaults to 20 when neither limit nor take is supplied.'
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    example: 20,
    description: 'Alias for limit, used only when limit is not supplied.'
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  take?: number;
}
