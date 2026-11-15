import type { Types } from 'mongoose';
import { maskAccountNumber } from '@app/shared';
import { isStaff, type Role } from '../../common/enums/role.enum';
import type { Party, Transaction } from './schemas/transaction.schema';

export interface PartyView {
  accountId?: string;
  maskedAccount: string;
  name: string;
  bankName?: string;
  ifsc?: string;
}

export interface TransactionView {
  id: string;
  reference: string;
  type: Transaction['type'];
  rail: Transaction['rail'];
  channel: Transaction['channel'];
  status: Transaction['status'];
  amount: number;
  fee: number;
  currency: string;
  /** From the viewer's point of view; undefined for staff looking at someone else's money. */
  direction?: 'DEBIT' | 'CREDIT';
  from?: PartyView;
  to?: PartyView;
  remarks?: string;
  category: Transaction['category'];
  failureReason?: string;
  settlementDueAt?: string;
  completedAt?: string;
  createdAt: string;
  risk?: { level: string; score?: number; decision?: string; reasons?: string[]; source?: string };
  metadata?: Record<string, unknown>;
}

function party(p: Party | undefined): PartyView | undefined {
  if (!p) return undefined;
  return {
    accountId: p.accountId?.toString(),
    maskedAccount: maskAccountNumber(p.accountNumber),
    name: p.name,
    bankName: p.bankName,
    ifsc: p.ifsc,
  };
}

export function toTransactionView(
  txn: Transaction & { _id: Types.ObjectId },
  viewer: { id: string; role: Role },
): TransactionView {
  const staff = isStaff(viewer.role);
  const isSender = txn.from?.customerId?.toString() === viewer.id;
  const isReceiver = txn.to?.customerId?.toString() === viewer.id;
  return {
    id: txn._id.toString(),
    reference: txn.reference,
    type: txn.type,
    rail: txn.rail,
    channel: txn.channel,
    status: txn.status,
    amount: txn.amount,
    fee: txn.fee,
    currency: txn.currency,
    direction: isSender ? 'DEBIT' : isReceiver ? 'CREDIT' : undefined,
    from: party(txn.from),
    to: party(txn.to),
    remarks: txn.remarks,
    category: txn.category,
    failureReason: txn.failureReason,
    settlementDueAt: txn.settlementDueAt?.toISOString(),
    completedAt: txn.completedAt?.toISOString(),
    createdAt: txn.createdAt.toISOString(),
    // Customers see the outcome; staff also see the score and the rules that fired.
    risk: txn.risk ? (staff ? { ...txn.risk } : { level: txn.risk.level }) : undefined,
    metadata: staff ? txn.metadata : undefined,
  };
}
