import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, type FilterQuery, type Model } from 'mongoose';
import { PaginatedResult } from '../../common/dto/paginated-result';
import type { RequestContext } from '../../common/types/auth.types';
import type { AuditActionType } from './audit-actions';
import {
  AuditChainVerifier,
  computeAuditHash,
  GENESIS_HASH,
  type ChainVerification,
} from './audit-hash';
import { User } from '../users/user.schema';
import { AuditLog, type AuditOutcome } from './audit-log.schema';

export interface AuditEntry {
  action: AuditActionType;
  outcome?: AuditOutcome;
  actor?: { id?: string; role?: string; label?: string };
  entity?: { type: string; id?: string };
  context?: RequestContext;
  details?: Record<string, unknown>;
}

export interface AuditQuery {
  page: number;
  limit: number;
  seq?: number;
  action?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
}

export type AuditVerificationReport = ChainVerification & {
  verifiedAt: string;
  durationMs: number;
};

const MAX_APPEND_ATTEMPTS = 8;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  /** userId -> email and role, so most records name their actor without a database read. */
  private readonly actors = new Map<string, { label: string; role: string }>();

  constructor(
    @InjectModel(AuditLog.name) private readonly logs: Model<AuditLog>,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  /**
   * Appends a record to the hash chain. The unique index on `seq` makes
   * concurrent appends safe: if two writers pick the same sequence number, one
   * insert fails with a duplicate key and retries on top of the new head.
   */
  async record(entry: AuditEntry): Promise<void> {
    const actor = await this.describeActor(entry.actor);
    for (let attempt = 1; attempt <= MAX_APPEND_ATTEMPTS; attempt++) {
      const head = await this.logs.findOne().sort({ seq: -1 }).select('seq hash').lean();
      const fields = stripUndefined({
        seq: (head?.seq ?? 0) + 1,
        at: new Date(),
        action: entry.action,
        outcome: entry.outcome ?? 'SUCCESS',
        actorId: actor?.id,
        actorRole: actor?.role,
        actorLabel: actor?.label,
        entityType: entry.entity?.type,
        entityId: entry.entity?.id,
        ip: entry.context?.ip,
        userAgent: entry.context?.userAgent,
        requestId: entry.context?.requestId,
        details: entry.details,
      });
      const prevHash = head?.hash ?? GENESIS_HASH;
      try {
        await this.logs.create({ ...fields, prevHash, hash: computeAuditHash(prevHash, fields) });
        return;
      } catch (error) {
        const isSeqConflict = (error as { code?: number }).code === 11000;
        if (!isSeqConflict || attempt === MAX_APPEND_ATTEMPTS) {
          this.logger.error(`Failed to write audit record ${entry.action}`, (error as Error).stack);
          throw error;
        }
        // Small randomized backoff so competing writers do not collide again.
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 15 * attempt));
      }
    }
  }

  /**
   * Every record should say who acted. Callers that only know the user id (a
   * transfer, a sign-out) get the email and role filled in here.
   */
  private async describeActor(actor: AuditEntry['actor']): Promise<AuditEntry['actor']> {
    if (!actor?.id || (actor.label && actor.role)) return actor;
    let known = this.actors.get(actor.id);
    if (!known && isValidObjectId(actor.id)) {
      const user = await this.users.findById(actor.id).select('email role').lean();
      if (user) {
        known = { label: user.email, role: user.role };
        if (this.actors.size >= 1_000) {
          const oldest = this.actors.keys().next();
          if (!oldest.done) this.actors.delete(oldest.value);
        }
        this.actors.set(actor.id, known);
      }
    }
    return { ...actor, label: actor.label ?? known?.label, role: actor.role ?? known?.role };
  }

  async list(query: AuditQuery): Promise<PaginatedResult<AuditLog>> {
    const filter: FilterQuery<AuditLog> = {};
    if (query.seq) filter.seq = query.seq;
    if (query.action) filter.action = query.action;
    if (query.actorId) filter.actorId = query.actorId;
    if (query.entityType) filter.entityType = query.entityType;
    if (query.entityId) filter.entityId = query.entityId;
    if (query.from || query.to) {
      filter.at = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    const [items, total] = await Promise.all([
      this.logs
        .find(filter)
        .sort({ seq: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      this.logs.countDocuments(filter),
    ]);
    return PaginatedResult.of(items, total, query.page, query.limit);
  }

  /**
   * Re-computes every hash in sequence order. Records are streamed with a
   * cursor and checked one by one, so memory use stays constant.
   */
  async verifyChain(): Promise<AuditVerificationReport> {
    const started = Date.now();
    const verifier = new AuditChainVerifier();
    const cursor = this.logs.find().sort({ seq: 1 }).lean().cursor();
    try {
      for await (const record of cursor) {
        if (!verifier.push(record)) break;
      }
    } finally {
      await cursor.close();
    }
    return {
      ...verifier.result(),
      verifiedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
    };
  }
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
