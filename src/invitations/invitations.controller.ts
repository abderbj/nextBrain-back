import { Controller, UseGuards } from '@nestjs/common';
import { Get, Query, Res, Request } from '@nestjs/common';
import { Response } from 'express';
import { Post, Body, BadRequestException } from '@nestjs/common';
import { SendInvitationDto } from './dto/send-invitation.dto';
import { CompleteRegistrationDto } from './dto/send-invitation.dto';
import { InvitationResponseDto } from './dto/invitation-response.dto';
import { InvitationsService } from './invitations.service';
import { ConfigService } from '@nestjs/config';
import { Auth } from 'src/common/decorators/auth.decorator';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationService: InvitationsService, private readonly configService: ConfigService) {}

  @Post('invite')
  @Auth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async inviteUser(@Body() dto: SendInvitationDto) {
    return this.invitationService.sendInvitation(dto);
  }

  @Post('resend-invitation')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async resendInvitation(@Body() dto: SendInvitationDto) {
    return this.invitationService.resendInvitation(dto.email);
  }

  // The token-based complete-registration and accept-invitation HTML endpoints have been
  // deprecated in favor of a simplified flow: admin sends a temporary password by email
  // and users log in at the frontend. Password change is then handled by the authenticated
  // `/users/password/first-time` endpoint. Keeping invite/resend endpoints only.

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getAllInvitations(): Promise<InvitationResponseDto[]> {
    return this.invitationService.getAllInvitations();
  }

  // accept-invitation endpoints removed to simplify the workflow. Invitations are
  // accepted automatically when the admin sends them and users authenticate using
  // the temporary password sent in email.
}
