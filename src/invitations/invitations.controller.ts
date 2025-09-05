import { Controller, UseGuards } from '@nestjs/common';
import { Get, Query, Res, Request } from '@nestjs/common';
import { Response } from 'express';
import { Post, Body, BadRequestException } from '@nestjs/common';
import { SendInvitationDto } from './dto/send-invitation.dto';
import { CompleteRegistrationDto } from './dto/send-invitation.dto';
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

  @Post('complete-registration')
  async completeRegistration(
    @Body() dto: CompleteRegistrationDto,
    @Request() req: any,
    @Query('invitationToken') invitationToken?: string,
    @Query('token') tokenQuery?: string,
  ) {
    // Resolve token from multiple possible sources: request body, URL query params, or
    // fall back to the authenticated user's pending invitation (if logged in).
    let token = dto.token || invitationToken || tokenQuery;

    if (!token) {
      const userEmail = req.user?.email;
      if (userEmail) {
        const invitation = await this.invitationService.getInvitationByEmail(userEmail);
        if (!invitation) {
          throw new BadRequestException('No pending invitation found for current user');
        }
        token = invitation.token;
      }
    }

    if (!token) {
      // Give a more actionable message so callers know how to fix the request.
      throw new BadRequestException(
        'Invitation token missing and user not identified. Provide the invitation token in the request body as "token" or include it in the URL as ?invitationToken=...; or log in first so the server can resolve your pending invitation.',
      );
    }

    return this.invitationService.completeRegistration(token, dto.password, {
      username: dto.username,
      fullName: dto.fullName,
      profileImage: dto.profileImage,
    });
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
      if (!token) {
        throw new Error('Invitation token is missing.');
      }
      
      // Validate token exists before showing form
      const invitation = await this.invitationService.validateToken(token);
      if (!invitation) {
        throw new Error('Invalid or expired invitation token.');
      }
      
      // Auto-accept for simplicity (skip the form step)
      await this.invitationService.acceptInvitation(token);
      
      return res.status(200).send(`
        <html>
          <head>
            <title>Invitation Accepted</title>
            <meta charset="utf-8">
          </head>
          <body style="font-family:sans-serif;text-align:center;padding:2rem;">
            <h1>✅ Invitation Accepted Successfully!</h1>
            <p>Email: ${invitation.email}</p>
            <p>Your invitation has been accepted. You can now register on the platform.</p>
            <p><a href="http://10.9.21.110:8080/?invitationToken=${invitation.token}" style="color:#4285f4;text-decoration:none;padding:10px 20px;background:#f0f0f0;border-radius:4px;">Go to Application</a></p>
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

  @Post('accept-invitation')
  async acceptInvitation(@Body('token') bodyToken: string, @Query('token') queryToken: string, @Res() res: Response) {
    try {
      const token = bodyToken || queryToken;
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
            <p><a href="http://10.9.21.110:8080/?invitationToken=${bodyToken || queryToken || ''}" style="color:#4285f4;text-decoration:none;">Go to Application</a></p>
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
