import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { HashService } from 'src/common/services/hash.service';
import { JwtPayload } from 'src/common/types/auth.types';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly hashService: HashService,
  ) {}

  async generateTokens(userId: number, username: string) {
    try {
      // Fetch the user's role
      const user = await this.usersService.findBy({ id: userId }, { role: true });
      if (!user) throw new Error('User not found');

      const [accessToken, refreshToken] = await Promise.all([
        this.jwtService.signAsync(
          { sub: userId, username, role: user.role },
          {
            expiresIn: '1d',
            secret: this.configService.get<string>('JWT_SECRET'),
          },
        ),
        this.jwtService.signAsync(
          { sub: userId, username, role: user.role },
          {
            expiresIn: '30d',
            secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          },
        ),
      ]);

      return {
        accessToken,
        refreshToken,
      };
    } catch (error) {
      throw new InternalServerErrorException(error, 'Error generating tokens');
    }
  }

  async storeRefreshToken(userId: number, refreshToken: string) {
    try {
      const refreshTokenExpires = new Date();
      refreshTokenExpires.setDate(refreshTokenExpires.getDate() + 30);

      const hashedRefreshToken =
        await this.hashService.hashPassword(refreshToken);

      await this.usersService.updateRefreshToken(
        userId,
        hashedRefreshToken,
        refreshTokenExpires,
      );
    } catch (error) {
      throw new InternalServerErrorException(
        error,
        'Error storing refresh token',
      );
    }
  }

  async verifyRefreshToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
    });
  }

  async generateTokenAndSetCookie(
    userId: number,
    username: string,
    res: Response,
  ) {
    const tokens = await this.generateTokens(userId, username);
    await this.storeRefreshToken(userId, tokens.refreshToken);
    this.setCookies(res, tokens);
    return tokens;
  }

  setCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    res.cookie('access_token', tokens.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 30 * 60 * 60 * 24 * 1000, // 30 days
    });
  }

  clearCookies(res: Response) {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
  }
}
