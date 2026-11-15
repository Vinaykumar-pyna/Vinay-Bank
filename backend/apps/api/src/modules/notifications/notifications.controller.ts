import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { AuthUser } from '../../common/types/auth.types';
import { NotificationsService } from './notifications.service';

class NotificationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly?: boolean;
}

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'My notifications (newest first)' })
  list(@CurrentUser() user: AuthUser, @Query() query: NotificationQueryDto) {
    return this.notifications.list(user.id, query.page, query.limit, query.unreadOnly);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Number of unread notifications' })
  unread(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark every notification as read' })
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark one notification as read' })
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.notifications.markRead(user.id, id);
  }
}
