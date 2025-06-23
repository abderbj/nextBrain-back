import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { EmailVerificationDto } from './dto/email-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UsersService } from 'src/users/users.service';
import { EmailService } from 'src/mail/mail.service';
import { HashService } from 'src/common/services/hash.service';
import { User } from '@prisma/client';
import { TokenService } from './token/token.service';
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    private readonly hashService: HashService,
    private readonly tokenService: TokenService,
  ) {}

  async validateUser(
    username: string,
    password: string,
  ): Promise<Omit<User, 'password_hash'> | null> {
    try {
      const user = await this.usersService.findByCredentials(username);
      if (!user) {
        return null;
      }
      const isPasswordValid = await this.hashService.comparePassword(
        password,
        user.password_hash,
      );

      if (!isPasswordValid) {
        throw new ForbiddenException('Invalid credentials');
      }

      if (!user.is_verified)
        throw new ForbiddenException('Email is not verified');

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password_hash, ...result } = user;
      return result;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid credentials');
    }
  }
  async verifyEmailWithToken(token: string): Promise<void> {
  const user = await this.usersService.findByVerificationToken(token);
  if (!user) {
    throw new ForbiddenException('Invalid or expired verification token');
  }
  if (user.verify_token_expires && new Date() > new Date(user.verify_token_expires)) {
    throw new ForbiddenException('Invalid or expired verification token');
  }
  if (user.is_verified) {
    // Already verified, just return silently
    return;
  }

  await this.usersService.verifyUser(user.id);
}

  async login(loginDto: LoginDto, res: Response) {
    try {
      const user = await this.validateUser(
        loginDto.username,
        loginDto.password,
      );

      const tokens = await this.tokenService.generateTokenAndSetCookie(
        user!.id,
        loginDto.username,
        res,
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { refresh_token, refresh_token_expires, ...userResponse } = user!;
      return {
        user: userResponse,
        accessToken: tokens.accessToken,
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(error, 'Login failed');
    }
  }

  async register(createUserDto: CreateUserDto) {
    try {
      const newUser = await this.usersService.create(createUserDto);

      const {
        token: verificationToken,
        expiresAt: verificationTokenExpiration,
      } = this.hashService.generateTokenWithExpiration(16, 24);

      await this.usersService.updateVerificationToken(
        newUser.id,
        verificationToken,
        verificationTokenExpiration,
      );

      await this.emailService.sendVerificationEmail(
        newUser.email,
        newUser.full_name,
        verificationToken,
      );

      return {
        message:
          'Registration successful. Please check your email to verify your account.',
        user: newUser,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new InternalServerErrorException(error, 'Registration failed');
    }
  }

  async logout(userId: number, res: Response) {
    try {
      await this.usersService.updateRefreshToken(userId, null, null);

      this.tokenService.clearCookies(res);

      return { message: 'Logged out successfully' };
    } catch (error) {
      throw new InternalServerErrorException(error, 'Logout failed');
    }
  }

  async verifyEmail(emailVerificationDto: EmailVerificationDto) {
    try {
      const { token } = emailVerificationDto;
      const user = await this.usersService.findByVerificationToken(token);
      if (!user) {
        throw new ForbiddenException('Invalid or expired verification token');
      }
      if (
        user.verify_token_expires &&
        new Date() > new Date(user.verify_token_expires)
      )
        throw new ForbiddenException('Invalid or expired verification token');

      await this.usersService.verifyUser(user.id);
      return { message: 'Email verified successfully' };
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new InternalServerErrorException(
        error,
        'Email verification failed',
      );
    }
  }

  async resendVerificationEmail(email: string) {
    try {
      const user = await this.usersService.findBy({ email }, undefined, false);
      if (!user) {
        return {
          message:
            'If this email is registered and not verified, a verification email has been sent. Please check your inbox or spam folder.',
        };
      }
      if (user.is_verified) {
        throw new BadRequestException('Email already verified');
      }
      const {
        token: verificationToken,
        expiresAt: verificationTokenExpiration,
      } = this.hashService.generateTokenWithExpiration(16, 24);

      await this.usersService.updateVerificationToken(
        user.id,
        verificationToken,
        verificationTokenExpiration,
      );

      await this.emailService.sendVerificationEmail(
        user.email,
        user.full_name,
        verificationToken,
      );
      return {
        message:
          'If this email is registered and not verified, a verification email has been sent. Please check your inbox or spam folder.',
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        error,
        'Failed to resend verification email',
      );
    }
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    try {
      const { email } = forgotPasswordDto;
      const user = await this.usersService.findBy({ email }, undefined, false);
      if (!user) {
        return {
          message:
            'If this email is registered, a reset link has been sent. Please check your inbox or spam folder.',
        };
      }
      const { token: resetToken, expiresAt: resetTokenExpiration } =
        this.hashService.generateTokenWithExpiration();

      await this.usersService.updateResetToken(
        user.id,
        resetToken,
        resetTokenExpiration,
      );

      await this.emailService.sendPasswordResetEmail(
        user.email,
        user.full_name,
        resetToken,
      );
      return {
        message:
          'Password reset email sent. Please check your inbox or spam folder.',
      };
    } catch (error) {
      throw new InternalServerErrorException(
        error,
        'Failed to process password reset request',
      );
    }
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    try {
      const { token, password } = resetPasswordDto;

      await this.usersService.resetPasswordWithToken(token, password);

      return { message: 'Password reset successfully' };
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new InternalServerErrorException(error, 'Password reset failed');
    }
  }

  async refreshTokens(refreshToken: string, res: Response) {
    try {
      // Verify the refresh token

      const payload = await this.tokenService.verifyRefreshToken(refreshToken);

      const userId = payload.sub;
      const username = payload.username;

      if (!userId || !username) {
        throw new UnauthorizedException('Invalid refresh token payload');
      }

      const user = await this.usersService.findBy(
        { id: userId },
        { refresh_token: true, refresh_token_expires: true },
        false,
      );

      if (!user || !user.refresh_token) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isRefreshTokenValid = await this.hashService.comparePassword(
        refreshToken,
        user.refresh_token,
      );

      if (!isRefreshTokenValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (
        user.refresh_token_expires &&
        new Date() > new Date(user.refresh_token_expires)
      ) {
        throw new UnauthorizedException('Refresh token expired');
      }

      const tokens = await this.tokenService.generateTokenAndSetCookie(
        user.id,
        user.username,
        res,
      );

      return {
        accessToken: tokens.accessToken,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (
        error instanceof Error &&
        (error.name === 'TokenExpiredError' ||
          error.name === 'JsonWebTokenError')
      ) {
        throw new UnauthorizedException(error, 'Invalid refresh token');
      }
      throw new InternalServerErrorException(error, 'Token refresh failed');
    }
  }
}
