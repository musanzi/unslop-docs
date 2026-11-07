import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '../../users/user-status';

export class AllowanceResponse {
  @ApiProperty({ enum: UserStatus })
  status: UserStatus;

  @ApiProperty()
  limit: number;

  @ApiProperty({ description: 'Successful documents charged to this reservation month' })
  used: number;

  @ApiProperty({ description: 'Active reservations created in this month' })
  reserved: number;

  @ApiProperty()
  remaining: number;

  @ApiProperty({ example: '2026-11' })
  month: string;

  @ApiProperty({ format: 'date-time', description: 'First instant of the next UTC calendar month' })
  resetsAt: string;
}
