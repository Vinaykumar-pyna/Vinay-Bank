import type { Schema } from 'mongoose';
import { AccountSchema } from '../modules/accounts/schemas/account.schema';
import { PostingSchema } from '../modules/accounts/schemas/posting.schema';
import { ApprovalSchema } from '../modules/approvals/approval.schema';
import { SessionSchema } from '../modules/auth/session.schema';
import { BeneficiarySchema } from '../modules/beneficiaries/beneficiary.schema';
import { IdempotencyRecordSchema } from '../modules/idempotency/idempotency.schema';
import { NotificationSchema } from '../modules/notifications/notification.schema';
import { OtpChallengeSchema } from '../modules/otp/otp-challenge.schema';
import { TransactionSchema } from '../modules/transactions/schemas/transaction.schema';
import { UserSchema } from '../modules/users/user.schema';

/**
 * Regression guard. In @nestjs/mongoose, `@Prop({ type: Types.ObjectId })` (the
 * BSON class) is treated as an empty nested class and silently becomes `Mixed`,
 * so ids are stored as strings and never match ObjectId queries. References
 * must use `Schema.Types.ObjectId`. This test fails if anyone reintroduces it.
 */
describe('schema reference types', () => {
  const cases: [string, Schema, string[]][] = [
    ['Account', AccountSchema as Schema, ['customerId', 'approvedBy']],
    ['Posting', PostingSchema as Schema, ['accountId', 'transactionId']],
    [
      'Transaction',
      TransactionSchema as Schema,
      [
        'initiatedBy',
        'approvalId',
        'from.accountId',
        'from.customerId',
        'to.accountId',
        'to.customerId',
      ],
    ],
    ['Beneficiary', BeneficiarySchema as Schema, ['ownerId', 'internalAccountId']],
    ['Approval', ApprovalSchema as Schema, ['entityId', 'customerId', 'makerId', 'checkerId']],
    ['Session', SessionSchema as Schema, ['userId']],
    ['Notification', NotificationSchema as Schema, ['userId']],
    ['OtpChallenge', OtpChallengeSchema as Schema, ['userId']],
    ['IdempotencyRecord', IdempotencyRecordSchema as Schema, ['userId']],
    ['User', UserSchema as Schema, ['kyc.reviewedBy']],
  ];

  it.each(cases)('%s reference paths are ObjectIds', (_name, schema, paths) => {
    for (const path of paths) {
      expect({ path, instance: schema.path(path)?.instance }).toEqual({
        path,
        instance: 'ObjectId',
      });
    }
  });
});
