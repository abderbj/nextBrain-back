import { PrismaService } from './../prisma/prisma.service';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateAccountType, UpdateUserDto } from './dto/update-user.dto';
import { Prisma } from '@prisma/client';
import { HashService } from 'src/common/services/hash.service';
import { UpdatePasswordDto } from './dto/update-password.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: HashService,
  ) {}
  async create(createUserDto: CreateUserDto) {
    // Check invitation before creating user (enforced in all environments)
    const invitation = await this.prisma.invitation.findUnique({
      where: { email: createUserDto.email },
    });
    if (!invitation || !invitation.accepted) {
      throw new ForbiddenException(
        'Registration is only allowed for invited users who have accepted their invitation.',
      );
    }

    // Check if invitation has expired
    if (invitation.expiresAt && new Date() > new Date(invitation.expiresAt)) {
      throw new ForbiddenException(
        'Your invitation has expired. Please contact an administrator for a new invitation.',
      );
    }
    
    await this.checkIfUserExists(createUserDto.email, createUserDto.username);

    // hash password
    const password_hash = await this.hashService.hashPassword(
      createUserDto.password,
    );

    // Create user and mark as verified since they registered through an accepted invitation
    return await this.prisma.user.create({
      data: {
        username: createUserDto.username,
        email: createUserDto.email,
        full_name: createUserDto.fullName,
        profile_image: createUserDto.profileImage,
        bio: createUserDto.bio,
        location: createUserDto.location,
        password_hash,
        is_verified: false, // User must verify email before logging in
      },
      select: this.userSafeFields,
    });
  }

  async findBy(
    where: Prisma.UserWhereUniqueInput,
    select?: Prisma.UserSelect,
    throwIfNotFound: boolean = true,
  ) {
    const user = await this.prisma.user.findUnique({
      where,
      select: { ...this.userSafeFields, ...select },
    });
    if (!user && throwIfNotFound) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByCredentials(credential: string) {
    return await this.prisma.user.findFirst({
      where: {
        OR: [{ username: credential }, { email: credential }],
      },
    });
  }

  async updateProfile(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.findBy({ id });

    // check if email or username already exists
    if (updateUserDto.email || updateUserDto.username)
      await this.checkIfUserExists(
        updateUserDto.email,
        updateUserDto.username,
        id,
      );

    return await this.prisma.user.update({
      where: { id },
      data: {
        username: updateUserDto.username ?? user!.username,
        email: updateUserDto.email ?? user!.email,
        full_name: updateUserDto.fullName ?? user!.full_name,
        profile_image: updateUserDto.profileImage ?? user!.profile_image,
        bio: updateUserDto.bio ?? user!.bio,
        location: updateUserDto.location ?? user!.location,
      },
      select: this.userSafeFields,
    });
  }

  async updatePassword(userId: number, updatePasswordDto: UpdatePasswordDto) {
    const user = await this.findBy({ id: userId }, { password_hash: true });

    const { currentPassword, newPassword } = updatePasswordDto;

    const isCurrentPasswordValid = await this.hashService.comparePassword(
      currentPassword,
      user!.password_hash,
    );
    if (!isCurrentPasswordValid) {
      throw new ForbiddenException('Current password is incorrect');
    }

    const password_hash = await this.hashService.hashPassword(newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password_hash },
      select: this.userSafeFields,
    });

    return { message: 'Password updated successfully' };
  }

  async updateAccountType(
    userId: number,
    updateAccountType: UpdateAccountType,
  ) {
    const user = await this.findBy({ id: userId }, { account_type: true });

    return await this.prisma.user.update({
      where: { id: userId },
      data: {
        account_type: updateAccountType.accountType ?? user!.account_type,
      },
      select: { ...this.userSafeFields, account_type: true },
    });
  }

  async findByVerificationToken(token: string) {
    return await this.prisma.user.findFirst({
      where: { verify_token: token },
    });
  }

  async verifyUser(id: number): Promise<void> {
    await this.findBy({ id });

    await this.prisma.user.update({
      where: { id },
      data: {
        is_verified: true,
        verify_token: null,
        verify_token_expires: null,
      },
      select: this.userSafeFields,
    });
  }

  async updateVerificationToken(
    id: number,
    token: string,
    verificationTokenExpiration: Date | null,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        verify_token: token,
        verify_token_expires: verificationTokenExpiration,
      },
    });
  }

  async findByResetToken(token: string) {
    return await this.prisma.user.findFirst({
      where: { reset_pass_token: token },
    });
  }

  async updateResetToken(
    id: number,
    token: string | null,
    resetTokenExpiration: Date | null,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        reset_pass_token: token,
        reset_pass_expires: resetTokenExpiration,
      },
    });
  }

  async resetPasswordWithToken(token: string, newPassword: string) {
    const user = await this.findByResetToken(token);
    if (!user) {
      throw new ForbiddenException('Invalid or expired reset token');
    }

    if (
      user.reset_pass_expires &&
      new Date() > new Date(user.reset_pass_expires)
    )
      throw new ForbiddenException('Invalid or expired reset token');

    // hash new password
    const password_hash = await this.hashService.hashPassword(newPassword);

    return await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash,
        reset_pass_token: null,
        reset_pass_expires: null,
      },
      select: this.userSafeFields,
    });
  }

  async updateRefreshToken(
    userId: number,
    refreshToken: string | null,
    refreshTokenExpires: Date | null,
  ) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refresh_token: refreshToken,
        refresh_token_expires: refreshTokenExpires,
      },
    });
  }

  async remove(id: number) {
    await this.findBy({ id });

    return await this.prisma.user.delete({
      where: { id },
      select: this.userSafeFields,
    });
  }

  async findInvitationByEmail(email: string) {
    return await this.prisma.invitation.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        accepted: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async checkInvitationStatus(email: string) {
    const invitation = await this.findInvitationByEmail(email);
    
    if (!invitation) {
      return {
        hasInvitation: false,
        message: 'No invitation found for this email address.',
      };
    }

    if (!invitation.accepted) {
      return {
        hasInvitation: true,
        accepted: false,
        message: 'Invitation found but not accepted yet. Please check your email and accept the invitation.',
      };
    }

    if (invitation.expiresAt && new Date() > new Date(invitation.expiresAt)) {
      return {
        hasInvitation: true,
        accepted: true,
        expired: true,
        message: 'Invitation has expired. Please contact an administrator for a new invitation.',
      };
    }

    return {
      hasInvitation: true,
      accepted: true,
      expired: false,
      message: 'Valid invitation found. You can proceed with registration.',
    };
  }

  async getAllUsers() {
    return await this.prisma.user.findMany({
      select: this.userSafeFields,
      orderBy: { created_at: 'desc' },
    });
  }

  private get userSafeFields() {
    return {
      id: true,
      username: true,
      email: true,
      full_name: true,
      profile_image: true,
      bio: true,
      location: true,
      is_verified: true,
      verify_token_expires: true,
      reset_pass_expires: true,
      created_at: true,
      updated_at: true,
    };
  }

  private async checkIfUserExists(
    email?: string,
    username?: string,
    excludeId?: number,
  ) {
    if (!email && !username) return;
    const conditions: Prisma.UserWhereInput[] = [];
    if (email) conditions.push({ email });
    if (username) conditions.push({ username });

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: conditions,
        NOT: excludeId ? { id: excludeId } : undefined,
      },
    });
    if (!existingUser) return;

    throw new ConflictException(
      'User with this email or username already exists',
    );
  }
}
