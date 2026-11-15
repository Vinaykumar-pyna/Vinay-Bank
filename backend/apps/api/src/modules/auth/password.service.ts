import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import type { AppConfig } from '../../config/configuration';

/**
 * Password hashing with bcrypt: salted (the salt is embedded in the hash) and
 * deliberately slow (cost factor 12, about 4096 key-expansion rounds), which
 * makes offline brute force of a leaked hash expensive.
 */
@Injectable()
export class PasswordService {
  private readonly rounds: number;
  private dummyHash?: Promise<string>;

  constructor(config: ConfigService<AppConfig, true>) {
    this.rounds = config.get('auth', { infer: true }).bcryptRounds;
  }

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  /**
   * When the user does not exist we still run a bcrypt comparison against a
   * dummy hash, so the response time does not reveal which emails are registered.
   */
  async verify(plain: string, hash: string | null | undefined): Promise<boolean> {
    if (!hash) {
      this.dummyHash ??= bcrypt.hash('timing-equalisation-only', this.rounds);
      await bcrypt.compare(plain, await this.dummyHash);
      return false;
    }
    return bcrypt.compare(plain, hash);
  }
}
