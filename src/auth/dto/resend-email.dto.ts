import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendEmailVerificationDto {
  @ApiProperty({
    description: 'Email address of the user to resend verification',
    example: 'johndoe@example.com',
    type: String,
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}
