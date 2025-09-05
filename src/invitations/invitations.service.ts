import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailService } from 'src/mail/mail.service';
import { HashService } from 'src/common/services/hash.service';
import { SendInvitationDto } from './dto/send-invitation.dto';
import { InvitationResponseDto } from './dto/invitation-response.dto';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly hashService: HashService,
  ) {}

  async sendInvitation(dto: SendInvitationDto) {
    const { email } = dto;

    // Create a single deterministic temporary password and its hash. We'll use a
    // transaction to persist the hashed password and invitation, then send the
    // plaintext to the user's email so both sides are consistent.
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  const tempPasswordPlain = Math.random().toString(36).slice(-10) + 'A1!';
  // DEBUG: print generated temporary password to server logs for troubleshooting
  console.log(`[INVITE DEBUG] generated temp password for ${email}: ${tempPasswordPlain}`);
  const hashed = await this.hashService.hashPassword(tempPasswordPlain);

    await this.prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({ where: { email } });
      if (!existingUser) {
        await tx.user.create({
          data: {
            email,
            username: email.split('@')[0],
            password_hash: hashed,
            full_name: '',
            is_verified: true,
            mustChangePassword: true,
          },
        });
      } else {
  await tx.user.update({ where: { email }, data: { password_hash: hashed, mustChangePassword: true, is_verified: true } });
      }

      await tx.invitation.upsert({
        where: { email },
        update: { token, expiresAt, accepted: false },
        create: { email, token, expiresAt },
      });
    });

    await this.emailService.sendInvitationEmail(email, token, tempPasswordPlain);
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

  async completeRegistration(token: string, password: string, profile: { username?: string; fullName?: string; profileImage?: string; }) {
  const invitation = await this.prisma.invitation.findUnique({ where: { token } });
      if (!invitation) {
        throw new ForbiddenException('Invalid or expired invitation token');
      }
      if (invitation.expiresAt && new Date() > new Date(invitation.expiresAt)) {
        throw new ForbiddenException('Invalid or expired invitation token');
      }

      // Find the user tied to this invitation (by email)
      const user = await this.prisma.user.findUnique({ where: { email: invitation.email } });
      if (!user) {
        throw new BadRequestException('User account not found for this invitation.');
      }

      // Hash new password
      const password_hash = await this.hashService.hashPassword(password);

      // Update user with new password and profile info, and clear mustChangePassword
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          password_hash,
          username: profile.username ?? user.username,
          full_name: profile.fullName ?? user.full_name,
          mustChangePassword: false,
        },
      });

      // Mark invitation accepted
      await this.markAccepted(invitation.id);

      return { message: 'Registration completed successfully' };
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

    // Also generate a new temporary password so the user can login with the resent credentials.
    const tempPasswordPlain = Math.random().toString(36).slice(-10) + 'A1!';
    const hashed = await this.hashService.hashPassword(tempPasswordPlain);

    // Persist both the new hashed password and the renewed invitation atomically.
    await this.prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({ where: { email } });
      if (!existingUser) {
        // If user somehow doesn't exist, create them so the invitation remains consistent
        await tx.user.create({
          data: {
            email,
            username: email.split('@')[0],
            password_hash: hashed,
            full_name: '',
            is_verified: true,
            mustChangePassword: true,
          },
        });
      } else {
        await tx.user.update({ where: { email }, data: { password_hash: hashed, mustChangePassword: true, is_verified: true } });
      }

      await tx.invitation.update({
        where: { email },
        data: { token, expiresAt },
      });
    });

    // Email the renewed invitation including the new temporary password
    await this.emailService.sendInvitationEmail(email, token, tempPasswordPlain);
    return { message: 'Invitation resent and renewed for 24 hours.' };
  }

  async getInvitationByEmail(email: string) {
    return await this.prisma.invitation.findUnique({ where: { email } });
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
