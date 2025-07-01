import { Controller, UseGuards } from '@nestjs/common';
import { Get, Query, Res, Request } from '@nestjs/common';
import { Response } from 'express';
import { Post, Body } from '@nestjs/common';
import { SendInvitationDto } from './dto/send-invitation.dto';
import { InvitationResponseDto } from './dto/invitation-response.dto';
import { InvitationsService } from './invitations.service';
import { Auth } from 'src/common/decorators/auth.decorator';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
@Controller('invitations')
export class InvitationsController {
    constructor(private readonly invitationService: InvitationsService) {}

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

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getAllInvitations(): Promise<InvitationResponseDto[]> {
    return this.invitationService.getAllInvitations();
  }

  @Get('accept-invitation')
  async showAcceptInvitationForm(@Query('token') token: string, @Res() res: Response) {
    try {
    // Serve a simple HTML form for password and full name
    return res.status(200).send(`
      <html>
        <head><title>Accept Invitation</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:2rem;">
          <h1>Accept Invitation</h1>
          <form method="POST" action="/api/invitations/accept-invitation?token=${token}">
            <button type="submit" style="padding:0.5rem 1.5rem;">Accept Invitation</button>
          </form>
        </body>
      </html>
    `);} catch (error) {
      return res.status(400).send(`
        <html>
          <head><title>Invitation Error</title></head>
          <body style="font-family:sans-serif;text-align:center;padding:2rem;">
            <h1>Error Accepting Invitation</h1>
            <p>${error.message || 'Invalid or expired invitation token'}</p>
          </body>
        </html>
      `);
    }
  }
    @Post('accept-invitation')
  async showStatus(@Query('token') token: string, @Res() res: Response) {
    try {
      if (!token) {
        throw new Error('Invitation token is missing.');
      }
      await this.invitationService.acceptInvitation(token);
      return res.status(200).send(`
        <html>
          <head><title>Invitation Accepted</title></head>
          <body style="font-family:sans-serif;text-align:center;padding:2rem;">
            <h1>✅ Invitation Accepted</h1>
            <p>Your invitation has been accepted. You can now register on the platform.</p>
          </body>
        </html>
      `);
    } catch (error) {
      return res.status(400).send(`
        <html>
          <head><title>Invitation Error</title></head>
          <body style="font-family:sans-serif;text-align:center;padding:2rem;">
            <h1>❌ Invitation Failed</h1>
            <p>${error.message || 'Invalid or expired invitation token'}</p>
          </body>
        </html>
      `);
    }
  }
}
