import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class EmailVerificationDto {
  @ApiProperty({
    description: 'Verification token',
    example: '1234567890abcdef',
    type: String,
  })
  @IsNotEmpty()
  @IsString()
  token: string;
}
