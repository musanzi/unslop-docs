import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '../entities';

export type IUserResponse = Omit<User, 'roles'> & {
  roles: string[];
};

export class UserResponse {
  @ApiProperty({ example: 'b7f2c1e0-4a5d-4c8e-9f1a-2b3c4d5e6f7a' })
  id: string;

  @ApiProperty({ example: '2026-09-21T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-21T10:00:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ example: 'john.doe@example.com' })
  email: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png', oneOf: [{ type: 'string' }, { type: 'null' }] })
  avatar: string;

  @ApiProperty({ example: ['user'], type: [String] })
  roles: string[];
}
