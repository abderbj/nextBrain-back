import { Request } from 'express';
import { Role } from '@prisma/client'
export interface RequestWithCookies extends Request {
  cookies: {
    access_token?: string;
    refresh_token?: string;
  };
}
export interface RequestWithUser extends Request {
  user: {
    id: number;
    username: string;
    role: Role; // Assuming role is a string, adjust as necessary
  };
}

export interface JwtPayload {
  sub: number;
  username: string;
  role: Role; // Assuming role is a string, adjust as necessary
}

export interface ValidatedUser {
  id: number;
  username: string;
  role: Role; // Assuming role is a string, adjust as necessary
}
