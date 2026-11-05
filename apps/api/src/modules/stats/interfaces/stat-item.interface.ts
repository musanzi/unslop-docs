import { ApiProperty } from '@nestjs/swagger';

export interface IStatItem {
  label: string;
  total: number;
}

export class StatItem {
  @ApiProperty({ example: 'users' })
  label: string;

  @ApiProperty({ example: 42 })
  total: number;
}
