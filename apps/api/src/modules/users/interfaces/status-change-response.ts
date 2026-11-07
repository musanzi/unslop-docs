import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '../user-status';

export class StatusChangeResponse {
  @ApiProperty({ example: '1' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ format: 'uuid' })
  adminId: string;

  @ApiProperty({ example: 'admin@example.com' })
  adminEmail: string;

  @ApiProperty({ example: '2026-11-05T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ enum: UserStatus })
  previousStatus: UserStatus;

  @ApiProperty({ enum: UserStatus })
  newStatus: UserStatus;
}
