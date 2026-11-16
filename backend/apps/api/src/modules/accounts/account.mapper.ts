import type { Types } from 'mongoose';
import { maskAccountNumber } from '@app/shared';
import { findBranchByCode } from '../../common/constants/branches';
import type { Account } from './schemas/account.schema';
import type { Posting } from './schemas/posting.schema';

export interface AccountView {
  id: string;
  accountNumber: string;
  maskedNumber: string;
  type: Account['type'];
  status: Account['status'];
  nickname?: string;
  ifsc: string;
  branch: { code: string; name: string; city: string };
  currency: string;
  ledgerBalance: number;
  holdAmount: number;
  availableBalance: number;
  dailyTransferLimit: number;
  interestRatePercent: number;
  statusReason?: string;
  openedAt?: string;
  createdAt: string;
}

export function toAccountView(account: Account & { _id: Types.ObjectId }): AccountView {
  const branch = findBranchByCode(account.branchCode);
  return {
    id: account._id.toString(),
    accountNumber: account.accountNumber,
    maskedNumber: maskAccountNumber(account.accountNumber),
    type: account.type,
    status: account.status,
    nickname: account.nickname,
    ifsc: account.ifsc,
    branch: {
      code: account.branchCode,
      name: branch?.name ?? 'Vinay Bank',
      city: branch?.city ?? '',
    },
    currency: account.currency,
    ledgerBalance: account.ledgerBalance,
    holdAmount: account.holdAmount,
    availableBalance: account.ledgerBalance - account.holdAmount,
    dailyTransferLimit: account.dailyTransferLimit,
    interestRatePercent: account.interestRateBps / 100,
    statusReason: account.statusReason,
    openedAt: account.openedAt?.toISOString(),
    createdAt: account.createdAt?.toISOString(),
  };
}

export interface PostingView {
  id: string;
  accountId: string;
  transactionId: string;
  reference: string;
  direction: Posting['direction'];
  amount: number;
  balanceAfter: number;
  narration: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  category: Posting['category'];
  channel: Posting['channel'];
  createdAt: string;
}

export function toPostingView(posting: Posting & { _id: Types.ObjectId }): PostingView {
  return {
    id: posting._id.toString(),
    accountId: posting.accountId.toString(),
    transactionId: posting.transactionId.toString(),
    reference: posting.reference,
    direction: posting.direction,
    amount: posting.amount,
    balanceAfter: posting.balanceAfter,
    narration: posting.narration,
    counterpartyName: posting.counterpartyName,
    counterpartyAccount: posting.counterpartyAccount,
    category: posting.category,
    channel: posting.channel,
    createdAt: posting.createdAt.toISOString(),
  };
}
