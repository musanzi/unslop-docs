import { ApiProperty } from '@nestjs/swagger';

export class RoleResponse {
  @ApiProperty({ example: 'b7f2c1e0-4a5d-4c8e-9f1a-2b3c4d5e6f7a' })
  id: string;

  @ApiProperty({ example: '2026-09-21T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-21T10:00:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ example: 'admin' })
  name: string;
}
