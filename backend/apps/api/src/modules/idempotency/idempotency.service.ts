import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { IdempotencyRecord, IdempotencyStatus } from './idempotency.schema';

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

export type IdempotencyStart<T> = { replay: true; response: T } | { replay: false };

/**
 * Idempotent POST requests: a client retrying the same transfer (double
 * click, timeout, flaky mobile network) must never move money twice.
 *
 *  1. begin():    insert the key as IN_PROGRESS (the unique index makes this a lock)
 *  2. complete(): store the response in the SAME MongoDB transaction as the money movement
 *  3. a retry with the same key and body gets the stored response back
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @InjectModel(IdempotencyRecord.name) private readonly records: Model<IdempotencyRecord>,
  ) {}

  static validateKey(key: string | undefined): string {
    if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'An Idempotency-Key header (8-100 letters, digits, - or _) is required',
      );
    }
    return key;
  }

  async begin<T>(userId: string, key: string, requestHash: string): Promise<IdempotencyStart<T>> {
    try {
      await this.records.create({
        userId,
        key,
        requestHash,
        status: IdempotencyStatus.IN_PROGRESS,
      });
      return { replay: false };
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    const existing = await this.records.findOne({ userId, key }).lean();
    if (!existing) return this.begin(userId, key, requestHash); // expired between calls
    if (existing.requestHash !== requestHash) {
      throw new AppException(
        ErrorCode.IDEMPOTENCY_CONFLICT,
        'This Idempotency-Key was already used for a different request',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (existing.status === IdempotencyStatus.IN_PROGRESS) {
      throw AppException.conflict('This request is still being processed. Please wait a moment.');
    }
    return { replay: true, response: existing.response as T };
  }

  async complete(
    userId: string,
    key: string,
    response: unknown,
    session: ClientSession,
  ): Promise<void> {
    await this.records.updateOne(
      { userId, key, status: IdempotencyStatus.IN_PROGRESS },
      { $set: { status: IdempotencyStatus.COMPLETED, response } },
      { session },
    );
  }

  /** The operation failed and rolled back: free the key so the client may retry. */
  async abandon(userId: string, key: string): Promise<void> {
    await this.records.deleteOne({ userId, key, status: IdempotencyStatus.IN_PROGRESS });
  }
}
