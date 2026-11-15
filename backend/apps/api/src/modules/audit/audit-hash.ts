import { canonicalJson, sha256Hex } from '@app/shared';

export const GENESIS_HASH = '0'.repeat(64);

/** The fields covered by the hash. Order does not matter: canonicalJson sorts keys. */
export interface HashableAuditFields {
  seq: number;
  at: Date;
  action: string;
  outcome: string;
  actorId?: string;
  actorRole?: string;
  actorLabel?: string;
  entityType?: string;
  entityId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

export type ChainedAuditRecord = HashableAuditFields & { prevHash: string; hash: string };

export function computeAuditHash(prevHash: string, fields: HashableAuditFields): string {
  const payload: Record<string, unknown> = {
    seq: fields.seq,
    at: fields.at.toISOString(),
    action: fields.action,
    outcome: fields.outcome,
    actorId: fields.actorId,
    actorRole: fields.actorRole,
    actorLabel: fields.actorLabel,
    entityType: fields.entityType,
    entityId: fields.entityId,
    ip: fields.ip,
    userAgent: fields.userAgent,
    requestId: fields.requestId,
    details: fields.details,
  };
  return sha256Hex(prevHash + canonicalJson(payload));
}

export interface ChainVerification {
  valid: boolean;
  checked: number;
  firstInvalidSeq?: number;
  reason?: string;
  lastHash: string;
}

/**
 * Incremental chain verifier: feed records in sequence order with `push()`.
 * Keeps only the previous hash in memory, so it can verify millions of records
 * streamed from a database cursor.
 */
export class AuditChainVerifier {
  private expectedPrev = GENESIS_HASH;
  private expectedSeq = 1;
  private checked = 0;
  private failure?: { seq: number; reason: string };

  /** Returns false once a broken record has been found (stop feeding records). */
  push(record: ChainedAuditRecord): boolean {
    if (this.failure) return false;
    if (record.seq !== this.expectedSeq) {
      return this.fail(
        record.seq,
        `Sequence gap: expected #${this.expectedSeq}, found #${record.seq}`,
      );
    }
    if (record.prevHash !== this.expectedPrev) {
      return this.fail(record.seq, 'Link broken: prevHash does not match the previous record');
    }
    if (computeAuditHash(record.prevHash, record) !== record.hash) {
      return this.fail(record.seq, 'Content changed: stored hash does not match the record');
    }
    this.expectedPrev = record.hash;
    this.expectedSeq += 1;
    this.checked += 1;
    return true;
  }

  result(): ChainVerification {
    return this.failure
      ? {
          valid: false,
          checked: this.checked,
          firstInvalidSeq: this.failure.seq,
          reason: this.failure.reason,
          lastHash: this.expectedPrev,
        }
      : { valid: true, checked: this.checked, lastHash: this.expectedPrev };
  }

  private fail(seq: number, reason: string): false {
    this.failure = { seq, reason };
    return false;
  }
}

/** Convenience wrapper for in-memory collections (used by unit tests). */
export function verifyAuditChain(records: Iterable<ChainedAuditRecord>): ChainVerification {
  const verifier = new AuditChainVerifier();
  for (const record of records) {
    if (!verifier.push(record)) break;
  }
  return verifier.result();
}
