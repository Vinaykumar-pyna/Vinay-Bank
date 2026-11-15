import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, type ClientSession } from 'mongoose';
import { AppException } from '../../common/exceptions/app.exception';
import { User, UserDocument } from './user.schema';

export interface LoginAttemptResult {
  locked: boolean;
  lockUntil?: Date;
  attemptsLeft: number;
}

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  get model(): Model<User> {
    return this.users;
  }

  async findById(id: string): Promise<UserDocument | null> {
    if (!isValidObjectId(id)) return null;
    return this.users.findById(id).exec();
  }

  async findByIdOrThrow(id: string): Promise<UserDocument> {
    const user = await this.findById(id);
    if (!user) throw AppException.notFound('User');
    return user;
  }

  /** Includes the password hash; only used by authentication flows. */
  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.users.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash').exec();
  }

  async findByIdWithPassword(id: string): Promise<UserDocument | null> {
    if (!isValidObjectId(id)) return null;
    return this.users.findById(id).select('+passwordHash').exec();
  }

  async existsBy(filter: Partial<Record<'email' | 'phone' | 'kyc.panBlindIndex', string>>) {
    return (await this.users.exists(filter)) !== null;
  }

  async create(data: Partial<User> & { _id?: unknown }, session?: ClientSession) {
    const [user] = await this.users.create([data], { session });
    return user;
  }

  /**
   * Atomically counts a failed login and locks the account once the limit is
   * reached. A single pipeline update avoids read-modify-write races when many
   * guesses arrive in parallel.
   */
  async registerFailedLogin(
    userId: string,
    maxAttempts: number,
    lockMinutes: number,
  ): Promise<LoginAttemptResult> {
    const lockUntil = new Date(Date.now() + lockMinutes * 60_000);
    const updated = await this.users
      .findByIdAndUpdate(
        userId,
        [
          {
            $set: { failedLoginAttempts: { $add: [{ $ifNull: ['$failedLoginAttempts', 0] }, 1] } },
          },
          {
            $set: {
              lockUntil: {
                $cond: [{ $gte: ['$failedLoginAttempts', maxAttempts] }, lockUntil, '$lockUntil'],
              },
              failedLoginAttempts: {
                $cond: [{ $gte: ['$failedLoginAttempts', maxAttempts] }, 0, '$failedLoginAttempts'],
              },
            },
          },
        ],
        { new: true },
      )
      .lean();

    const locked = Boolean(updated?.lockUntil && updated.lockUntil > new Date());
    return {
      locked,
      lockUntil: locked ? updated?.lockUntil : undefined,
      attemptsLeft: locked ? 0 : Math.max(0, maxAttempts - (updated?.failedLoginAttempts ?? 0)),
    };
  }

  async registerSuccessfulLogin(userId: string, ip?: string): Promise<void> {
    await this.users.updateOne(
      { _id: userId },
      {
        $set: { failedLoginAttempts: 0, lastLoginAt: new Date(), lastLoginIp: ip },
        $unset: { lockUntil: 1 },
      },
    );
  }
}
