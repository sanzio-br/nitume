// NotificationsCountApi (customer-v-new-category §W5, H§Data): the Home
// bell's unread count. #11 may move it. Through the #6 lazy interceptor.
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_V1 } from './errands.api';

@Injectable({ providedIn: 'root' })
export class NotificationsCountApi {
  private readonly http = inject(HttpClient);

  /** `GET /notifications/unread-count` → `{ unread }`. */
  async unread(): Promise<number> {
    const body = await firstValueFrom(this.http.get<{ unread: number }>(`${API_V1}/notifications/unread-count`));
    return typeof body?.unread === 'number' ? body.unread : 0;
  }
}
