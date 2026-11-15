import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  isValidObjectId,
  type ClientSession,
  type Connection,
  type FilterQuery,
  type Model,
  type Types,
} from 'mongoose';
import { PaginatedResult } from '../../common/dto/paginated-result';
import { CHECKER_ROLES, type Role } from '../../common/enums/role.enum';
import { DomainEvents, type ApprovalEvent } from '../../common/events/domain-events';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { AuthUser, RequestContext } from '../../common/types/auth.types';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { Approval, ApprovalDocument, ApprovalStatus, ApprovalType } from './approval.schema';

/** What a decision handler may ask to run once the database transaction has committed. */
export interface HandlerOutcome {
  afterCommit?: () => void | Promise<void>;
}

/**
 * Each approval type plugs in its own handler (Strategy + Registry): the
 * approvals module never needs to know about transfers, accounts or cash.
 */
export interface ApprovalHandler {
  approve(
    approval: ApprovalDocument,
    checker: AuthUser,
    session: ClientSession,
  ): Promise<HandlerOutcome | void>;
  reject(
    approval: ApprovalDocument,
    checker: AuthUser,
    reason: string,
    session: ClientSession,
  ): Promise<HandlerOutcome | void>;
}

export interface CreateApprovalInput {
  type: ApprovalType;
  entityType: string;
  entityId: string | Types.ObjectId;
  title: string;
  amount?: number;
  customerId?: string | Types.ObjectId;
  customerName?: string;
  accountNumber?: string;
  details?: Record<string, unknown>;
  maker: { id: string; role: Role | string; name: string };
  branchCode?: string;
}

export interface ApprovalQuery {
  page: number;
  limit: number;
  status?: ApprovalStatus;
  type?: ApprovalType;
}

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);
  private readonly handlers = new Map<ApprovalType, ApprovalHandler>();

  constructor(
    @InjectModel(Approval.name) private readonly approvals: Model<Approval>,
    @InjectConnection() private readonly connection: Connection,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  registerHandler(type: ApprovalType, handler: ApprovalHandler): void {
    this.handlers.set(type, handler);
  }

  async create(input: CreateApprovalInput, session?: ClientSession): Promise<ApprovalDocument> {
    const [approval] = await this.approvals.create(
      [
        {
          type: input.type,
          entityType: input.entityType,
          entityId: input.entityId,
          title: input.title,
          amount: input.amount,
          customerId: input.customerId,
          customerName: input.customerName,
          accountNumber: input.accountNumber,
          details: input.details,
          makerId: input.maker.id,
          makerRole: input.maker.role,
          makerName: input.maker.name,
          branchCode: input.branchCode,
        },
      ],
      { session },
    );
    return approval;
  }

  /** Publish after the creating transaction commits, so listeners see the record. */
  announce(approval: ApprovalDocument): void {
    this.events.emit(DomainEvents.APPROVAL_REQUESTED, {
      approvalId: approval.id,
    } satisfies ApprovalEvent);
  }

  async list(query: ApprovalQuery): Promise<PaginatedResult<Approval & { _id: unknown }>> {
    const filter: FilterQuery<Approval> = {};
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    const [items, total] = await Promise.all([
      this.approvals
        .find(filter)
        .sort({ status: 1, createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      this.approvals.countDocuments(filter),
    ]);
    return PaginatedResult.of(items, total, query.page, query.limit);
  }

  async findById(id: string) {
    if (!isValidObjectId(id)) return null;
    return this.approvals.findById(id);
  }

  async countPending(): Promise<number> {
    return this.approvals.countDocuments({ status: ApprovalStatus.PENDING });
  }

  /**
   * Approve or reject. Rules enforced here:
   *  - only checkers (manager, admin) can decide
   *  - the maker can never approve their own request (four-eyes principle)
   *  - a request is decided exactly once, even if two checkers click at the same time
   *  - the decision and its effect (e.g. moving money) commit atomically
   */
  async decide(
    id: string,
    checker: AuthUser,
    decision: ApprovalStatus.APPROVED | ApprovalStatus.REJECTED,
    remarks: string | undefined,
    ctx: RequestContext,
  ): Promise<ApprovalDocument> {
    if (!CHECKER_ROLES.includes(checker.role)) throw AppException.forbidden();
    const approval = await this.findById(id);
    if (!approval) throw AppException.notFound('Approval request');
    if (approval.status !== ApprovalStatus.PENDING) {
      throw AppException.conflict('This request has already been decided');
    }
    if (approval.makerId.toString() === checker.id) {
      throw new AppException(
        ErrorCode.MAKER_CHECKER_VIOLATION,
        'You cannot approve or reject a request that you initiated',
        HttpStatus.FORBIDDEN,
      );
    }
    if (decision === ApprovalStatus.REJECTED && !remarks?.trim()) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Please give a reason for the rejection');
    }
    const handler = this.handlers.get(approval.type);
    if (!handler) throw new Error(`No approval handler registered for ${approval.type}`);

    const checkerUser = await this.users.findByIdOrThrow(checker.id);
    const checkerName = `${checkerUser.firstName} ${checkerUser.lastName}`;

    const { result, outcome } = await this.connection.transaction(async (session) => {
      const decided = await this.approvals.findOneAndUpdate(
        { _id: approval._id, status: ApprovalStatus.PENDING },
        {
          $set: {
            status: decision,
            checkerId: checker.id,
            checkerName,
            decidedAt: new Date(),
            remarks: remarks?.trim(),
          },
        },
        { new: true, session },
      );
      if (!decided) throw AppException.conflict('This request has already been decided');
      const handlerOutcome =
        decision === ApprovalStatus.APPROVED
          ? await handler.approve(decided, checker, session)
          : await handler.reject(decided, checker, remarks!.trim(), session);
      return { result: decided, outcome: handlerOutcome ?? undefined };
    });

    await this.audit.record({
      action:
        decision === ApprovalStatus.APPROVED
          ? AuditAction.APPROVAL_APPROVED
          : AuditAction.APPROVAL_REJECTED,
      actor: { id: checker.id, role: checker.role, label: checkerName },
      entity: { type: 'Approval', id: result.id },
      context: ctx,
      details: {
        approvalType: result.type,
        entityType: result.entityType,
        entityId: result.entityId.toString(),
        amount: result.amount,
        makerId: result.makerId.toString(),
        remarks: result.remarks,
      },
    });
    this.events.emit(DomainEvents.APPROVAL_DECIDED, {
      approvalId: result.id,
    } satisfies ApprovalEvent);
    try {
      await outcome?.afterCommit?.();
    } catch (error) {
      this.logger.error('Post-commit approval hook failed', (error as Error).stack);
    }
    return result;
  }
}
