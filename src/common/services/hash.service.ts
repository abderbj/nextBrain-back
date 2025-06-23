import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class HashService {
  private readonly saltRounds = 10;
  constructor() {}

  async hashPassword(password: string) {
    return await bcrypt.hash(password, this.saltRounds);
  }

  async comparePassword(password: string, hash: string) {
    return await bcrypt.compare(password, hash);
  }

  generateTokenWithExpiration(
    byteSize: number = 16,
    expirationHours: number = 1,
  ) {
    const token = crypto.randomBytes(byteSize).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expirationHours);
    return { token, expiresAt };
  }
}
