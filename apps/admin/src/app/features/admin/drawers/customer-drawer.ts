import { Component, input, signal } from '@angular/core';
import type { AdminUserSummary } from '../../../core/api-types';
import { maskedId } from '../admin-data.service';
import { formatPhone } from '../shared-format';
import { UserStatusSectionComponent } from './user-status.section';

/**
 * Customer drawer (drawer-user-status §2, owner SQ-3): the customer's name
 * and phone, then the `Account` section. Id = the customer's **user** id
 * (refund `customer.userId`, task `customerUserId`). The header comes from
 * the section's account summary (U-1), so the account is fetched once.
 */
@Component({
  selector: 'app-customer-drawer',
  imports: [UserStatusSectionComponent],
  template: `
    @if (account(); as a) {
      <section class="drawer-section">
        <div class="drawer-card">
          <div class="drawer-row">
            <span>Customer</span>
            @if (a.displayName) {
              <b class="txt">{{ a.displayName }}</b>
            } @else {
              <b>{{ maskedId(a.id) }}</b>
            }
          </div>
          <div class="drawer-row">
            <span>Phone</span><b>{{ formatPhone(a.phone) }}</b>
          </div>
        </div>
      </section>
    }
    <app-user-status-section
      [userId]="userId()"
      audience="customer"
      (account)="account.set($event)"
      (missingAccount)="account.set(null)"
    />
  `,
  styles: [],
})
export class CustomerDrawerComponent {
  readonly userId = input.required<string>();

  protected readonly account = signal<AdminUserSummary | null>(null);

  protected readonly maskedId = maskedId;
  protected readonly formatPhone = formatPhone;
}
