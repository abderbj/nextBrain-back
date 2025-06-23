import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailService } from 'src/mail/mail.service';
import { SendInvitationDto } from './dto/send-invitation.dto';

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

}
