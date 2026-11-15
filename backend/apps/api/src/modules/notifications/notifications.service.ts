import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, type Types } from 'mongoose';
import { PaginatedResult } from '../../common/dto/paginated-result';
import type { Role } from '../../common/enums/role.enum';
import { AppException } from '../../common/exceptions/app.exception';
import { User, UserStatus } from '../users/user.schema';
import { Notification, NotificationType } from './notification.schema';
import { NotificationsGateway } from './notifications.gateway';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  data?: Record<string, unknown>;
}

export interface NotificationView extends NotificationInput {
  id: string;
  read: boolean;
  createdAt: string;
}

function toView(n: Notification & { _id: Types.ObjectId }): NotificationView {
  return {
    id: n._id.toString(),
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    data: n.data,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private readonly notifications: Model<Notification>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly gateway: NotificationsGateway,
  ) {}

  /** Stores the notification (for the inbox) and pushes it live to the user's open tabs. */
  async notify(userId: string, input: NotificationInput): Promise<NotificationView> {
    const created = await this.notifications.create({ userId, ...input });
    const view = toView(created.toObject());
    this.gateway.toUser(userId, 'notification', view);
    return view;
  }

  /** Notifies every active staff member with one of the given roles. */
  async notifyRoles(roles: Role[], input: NotificationInput): Promise<void> {
    const staff = await this.users
      .find({ role: { $in: roles }, status: UserStatus.ACTIVE })
      .select('_id')
      .lean();
    await Promise.all(staff.map((member) => this.notify(member._id.toString(), input)));
  }

  async list(userId: string, page: number, limit: number, unreadOnly = false) {
    const filter = { userId, ...(unreadOnly ? { read: false } : {}) };
    const [items, total] = await Promise.all([
      this.notifications
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.notifications.countDocuments(filter),
    ]);
    return PaginatedResult.of(items.map(toView), total, page, limit);
  }

  async unreadCount(userId: string): Promise<{ unread: number }> {
    return { unread: await this.notifications.countDocuments({ userId, read: false }) };
  }

  async markRead(userId: string, id: string): Promise<void> {
    if (!isValidObjectId(id)) throw AppException.notFound('Notification');
    const result = await this.notifications.updateOne(
      { _id: id, userId },
      { $set: { read: true } },
    );
    if (result.matchedCount === 0) throw AppException.notFound('Notification');
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notifications.updateMany(
      { userId, read: false },
      { $set: { read: true } },
    );
    return { updated: result.modifiedCount };
  }
}
