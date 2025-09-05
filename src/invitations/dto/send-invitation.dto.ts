import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SendInvitationDto {
  @IsEmail()
  email: string;
}

export class AcceptInvitationDto {
  token: string;
  @IsOptional()
  password?: string;
  @IsOptional()
  fullName?: string;
}

export class CompleteRegistrationDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  profileImage?: string;
}
