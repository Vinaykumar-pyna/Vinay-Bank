import { Logger } from '@nestjs/common';
import { type OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { isStaff, type Role } from '../../common/enums/role.enum';
import { SessionsService } from '../auth/sessions.service';
import { TokenService } from '../auth/token.service';

/**
 * Real-time push over Socket.IO (WebSocket with automatic fallback).
 *
 * The browser connects with its access token in the handshake. The token and
 * its session are verified exactly as for HTTP requests, then the socket joins
 * a private room `user:<id>` (and `role:<ROLE>` for staff), so each event only
 * reaches the people it concerns.
 */
@WebSocketGateway({ path: '/socket.io' })
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionsService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = (client.handshake.auth as { token?: unknown } | undefined)?.token;
      if (typeof token !== 'string') throw new Error('missing token');
      const claims = await this.tokens.verifyAccessToken(token);
      if (!(await this.sessions.isActive(claims.sid, claims.sub))) throw new Error('session ended');
      client.data = { userId: claims.sub, role: claims.role };
      await client.join(`user:${claims.sub}`);
      if (isStaff(claims.role)) await client.join([`role:${claims.role}`, 'staff']);
    } catch (error) {
      this.logger.debug(`Rejected socket connection: ${(error as Error).message}`);
      client.emit('auth_error', { message: 'Authentication failed' });
      client.disconnect(true);
    }
  }

  toUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  toRoles(roles: Role[], event: string, payload: unknown): void {
    this.server?.to(roles.map((role) => `role:${role}`)).emit(event, payload);
  }
}
