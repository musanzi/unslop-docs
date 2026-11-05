import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'reset-token' })
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'newSecret123', minLength: 6 })
  @MinLength(6)
  password: string;
}
