import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthContext } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  ListNotificationsDto,
  NotificationIdParamsDto,
  NotificationsList,
} from './dto/notification.dto';
import { AppNotification } from './app-notification.entity';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Query() query: ListNotificationsDto,
    @CurrentUser() user: AuthContext,
  ): Promise<NotificationsList> {
    return this.notifications.listForUser(user.userId, query.limit);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthContext): Promise<{ unread: number }> {
    return this.notifications.listForUser(user.userId, 1).then((r) => ({ unread: r.unread }));
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthContext): Promise<{ updated: number }> {
    return this.notifications.markAllRead(user.userId);
  }

  @Patch(':id/read')
  markRead(
    @Param() params: NotificationIdParamsDto,
    @CurrentUser() user: AuthContext,
  ): Promise<AppNotification> {
    return this.notifications.markRead(user.userId, params.id);
  }
}