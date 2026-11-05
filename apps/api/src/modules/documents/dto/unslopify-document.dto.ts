import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { defaultRewriteStrength } from '../document-processing';

export class UnslopifyDocumentDto {
  @ApiPropertyOptional({
    default: defaultRewriteStrength,
    minimum: 1,
    maximum: 100,
    description:
      'Rewrite strength from light edits (1) to thorough rewriting (100). It controls editing extent, not a promised score reduction'
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  strength: number = defaultRewriteStrength;
}
