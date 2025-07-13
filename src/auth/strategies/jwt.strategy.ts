import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JwtPayload,
  RequestWithCookies,
  ValidatedUser,
} from 'src/common/types/auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
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

  validate(payload: JwtPayload): ValidatedUser {
    return { id: payload.sub, username: payload.username , role: payload.role };
  }
}
