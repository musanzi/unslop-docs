import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'secret123' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ example: ['b7f2c1e0-4a5d-4c8e-9f1a-2b3c4d5e6f7a'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  roles?: string[];
}
