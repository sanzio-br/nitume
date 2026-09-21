import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { AppNotification } from '../app-notification.entity';

export class ListNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class NotificationIdParamsDto {
  @IsUUID()
  id: string;
}

export interface NotificationsList {
  items: AppNotification[];
  unread: number;
}