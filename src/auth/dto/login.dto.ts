import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Username of the user',
    example: 'john_doe',
    type: String,
  })
  @IsNotEmpty()
  @IsString()
  username: string;
  @ApiProperty({
    description: 'Password of the user',
    example: 'password123',
    type: String,
  })
  @IsNotEmpty()
  @IsString()
  password: string;
}
