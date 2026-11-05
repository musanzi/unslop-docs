import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class SignInDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'secret123' })
  @IsNotEmpty()
  password: string;
}
