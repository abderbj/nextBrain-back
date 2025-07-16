import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailService } from 'src/mail/mail.service';
import { SendInvitationDto } from './dto/send-invitation.dto';
import { InvitationResponseDto } from './dto/invitation-response.dto';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async sendInvitation(dto: SendInvitationDto) {
    const { email } = dto;
    const existingInvitation = await this.prisma.invitation.findUnique({ where: { email } });
    if (existingInvitation && !existingInvitation.accepted) {
      throw new BadRequestException('Invitation already sent to this email.');
    }
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await this.prisma.invitation.upsert({
      where: { email },
      update: { token, expiresAt, accepted: false },
      create: { email, token, expiresAt },
    });
    await this.emailService.sendInvitationEmail(email, token);
    return { message: 'Invitation sent.' };
  }

    private async markAccepted(id : number) : Promise<void> {
        const invitation = await this.prisma.invitation.findUnique({ where: { id } });
        if (!invitation) {
            throw new BadRequestException('Invitation not found.');
        }

        await this.prisma.invitation.update({
            where: { id },
            data: { accepted: true },
        });
    }

    async validateToken(token: string): Promise<any> {
        const invitation = await this.prisma.invitation.findUnique({ where: { token } });
        if (!invitation) {
            return null;
        }
        if (invitation.expiresAt && new Date() > new Date(invitation.expiresAt)) {
            return null;
        }
        return invitation;
    }

    async acceptInvitation(token: string): Promise<void> {
    const invitation = await this.prisma.invitation.findUnique({ where: { token } });
      if (!invitation) {
        throw new ForbiddenException('Invalid or expired verification token');
      }
      if (invitation.expiresAt && new Date() > new Date(invitation.expiresAt)) {
        throw new ForbiddenException('Invalid or expired verification token');
      }
      if (invitation.accepted) {
        return;
      }
    return this.markAccepted(invitation.id);
  }

  async resendInvitation(email: string) {
    const existingInvitation = await this.prisma.invitation.findUnique({ where: { email } });
    if (!existingInvitation) {
      throw new BadRequestException('No invitation found for this email.');
    }
    if (existingInvitation.accepted) {
      throw new BadRequestException('Invitation has already been accepted.');
    }
    
    // Generate new token and extend expiration to 24 hours from now
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    await this.prisma.invitation.update({
      where: { email },
      data: { token, expiresAt },
    });
    
    await this.emailService.sendInvitationEmail(email, token);
    return { message: 'Invitation resent and renewed for 24 hours.' };
  }

  async getAllInvitations(): Promise<InvitationResponseDto[]> {
    return await this.prisma.invitation.findMany({
      select: {
        id: true,
        email: true,
        accepted: true,
        createdAt: true,
        expiresAt: true,
        // Don't expose the token for security
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

}
