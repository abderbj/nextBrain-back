import { IsEmail, IsOptional } from 'class-validator';

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
