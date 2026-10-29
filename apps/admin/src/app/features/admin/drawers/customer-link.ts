import { Component, inject, input } from '@angular/core';
import { DrawerNavService } from '../drawer-nav.service';

/**
 * `Open customer` (drawer-user-status §2, SQ-3): switches the drawer to the
 * Customer drawer for this user id. Mounted with `@defer` in the task and
 * refund drawers so it stays out of the initial bundle.
 */
@Component({
  selector: 'app-customer-link',
  imports: [],
  template: `
    <button type="button" class="btn btn-text btn-sm" (click)="open()">Open customer</button>
  `,
  styles: [':host { display: contents; }'],
})
export class CustomerLinkComponent {
  private readonly nav = inject(DrawerNavService);

  /** The customer's user id (refund `customer.userId`, task `customerUserId`). */
  readonly userId = input.required<string>();

  protected open(): void {
    this.nav.open('customer', this.userId());
  }
}
