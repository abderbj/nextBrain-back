import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JwtPayload,
  RequestWithCookies,
  ValidatedUser,
} from 'src/common/types/auth.types';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: RequestWithCookies) => {
          const token = req?.cookies?.access_token ?? null;
          console.log('JWT Strategy - Extracting token from cookies:', {
            hasCookies: !!req?.cookies,
            hasAccessToken: !!token,
            cookieKeys: req?.cookies ? Object.keys(req.cookies) : [],
            token: token ? `${token.substring(0, 20)}...` : null
          });
          return token;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  // Make validate async and return the full user record when possible so
  // downstream handlers (req.user) receive the canonical user object.
  async validate(payload: JwtPayload): Promise<ValidatedUser> {
    const userId = payload.sub;
    try {
      // Attempt to load the full user safe fields from the database.
  // Request the role field explicitly so downstream guards (RolesGuard)
  // can perform role comparisons correctly.
  const user = await this.usersService.findBy({ id: userId }, { role: true }, false);
      if (user) {
        // Return the user object as-is (ValidatedUser is compatible with user safe fields)
        return user as any;
      }
    } catch (e) {
      // Fall back to the minimal payload if DB lookup fails
      console.warn('JwtStrategy: failed to load full user from DB', e);
    }

    // Fallback: return minimal validated user derived from token payload
    return { id: payload.sub, username: payload.username, role: payload.role } as any;
  }
}
