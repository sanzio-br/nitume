// `nm-stk-status` (#8 A§8, customer-v-payment §Layout; app `StkStatusView`,
// widgets/stk_view.dart). One component for `v-payment` and the item
// payment's variant B: the icon circle (green-050 while waiting and on
// success; slate with a blue glyph on failure: red is never a surface,
// OA-13), the heading in a polite live region, the body (payer number in
// `nmNum`), the amount (`amount-lg`, spoken shillings), the optional
// `Includes …` line (the item amount's own line, WQ-27), the dots while
// PENDING, the 220px button stack and the still-pending line.
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { formatKes, isPositiveKes, kesSpoken } from '../../../shared/format/formatters';
import { NmNum } from '../../../shared/format/num.directive';
import { NmButton } from '../../../shared/ui/button/button.component';
import { NmIcon } from '../../../shared/ui/icon/icon.component';
import { NmPulsingDots } from '../../../shared/ui/pulsing-dots/pulsing-dots.component';

export type StkTone = 'waiting' | 'success' | 'failed';

export interface StkButton {
  readonly label: string;
  readonly loading?: boolean;
  readonly disabled?: boolean;
}

/** Copy shared by `v-payment` and variant B (mobile spec, as built). */
export const STK_COPY = {
  checkPhone: 'Check your phone',
  failedHeading: "Payment didn't go through",
  failedBody: "M-Pesa didn't confirm this payment. You haven't been charged. You can try again.",
  timeoutHeading: 'Still checking your payment',
  timeoutBody: "M-Pesa hasn't confirmed yet. If you entered your PIN, don't pay again. We'll update this screen as soon as we hear back.",
  stillPending: "We haven't heard from M-Pesa yet. Keep this screen open.",
  waitingDots: 'Waiting for M-Pesa confirmation',
  paid: "I've paid — continue",
  tryAgain: 'Try again',
  back: 'Back',
  checkAgain: 'Check again',
  newPrompt: 'Send a new prompt',
} as const;

@Component({
  selector: 'nm-stk-status',
  imports: [NmIcon, NmNum, NmButton, NmPulsingDots],
  template: `
    <div class="nm-stk">
      <span class="nm-stk__circle" [class]="'nm-stk__circle nm-stk__circle--' + tone()" aria-hidden="true">
        <nm-icon [name]="tone() === 'success' ? 'check' : 'phone'" [size]="28" />
      </span>
      <div class="nm-stk__live" aria-live="polite">
        <h2 class="nm-stk__heading" tabindex="-1">{{ heading() }}</h2>
        <p class="nm-stk__body">
          {{ body() }}@if (payer(); as p) {<span class="nm-stk__payer" nmNum>{{ p }}</span>}{{ bodyEnd() }}
        </p>
        @if (reason(); as r) {
          <p class="nm-stk__body nm-stk__reason">{{ r }}</p>
        }
      </div>
      @if (amountText(); as a) {
        <p class="nm-stk__amount" nmNum="amount-lg" [nmNumLabel]="amountSpoken()">{{ a }}</p>
        @if (includesText(); as inc) {
          <p class="nm-stk__includes">Includes <span nmNum>{{ inc }}</span> for your runner's purchase.</p>
        }
      }
      @if (pending()) {
        <nm-pulsing-dots class="nm-stk__dots" [label]="copy.waitingDots" />
      }
      @if (primary() || secondary()) {
        <div class="nm-stk__actions">
          @if (primary(); as b) {
            <nm-button class="nm-stk__primary" [expand]="true" [loading]="!!b.loading" [disabled]="!!b.disabled" (pressed)="primaryPressed.emit()">{{
              b.label
            }}</nm-button>
          }
          @if (secondary(); as b) {
            <nm-button class="nm-stk__secondary" variant="outline" [expand]="true" [loading]="!!b.loading" [disabled]="!!b.disabled" (pressed)="secondaryPressed.emit()">{{
              b.label
            }}</nm-button>
          }
        </div>
      }
      @if (stillPending()) {
        <p class="nm-stk__still">{{ copy.stillPending }}</p>
      }
    </div>
  `,
  styleUrl: './stk-status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmStkStatus {
  readonly tone = input<StkTone>('waiting');
  readonly heading = input.required<string>();
  /** Body text before the payer number (or the whole body). */
  readonly body = input.required<string>();
  /** Formatted payer number, shown in `nmNum` inside the body. */
  readonly payer = input<string | null>(null);
  /** Body text after the payer number. */
  readonly bodyEnd = input('');
  /** Second line, e.g. the provider's failure reason. */
  readonly reason = input<string | null>(null);
  /** The charge (decimal string); null hides it until the payment is known. */
  readonly amount = input<string | null>(null);
  /** Item amount inside the charge (send-to-runner only); its own line when > 0. */
  readonly includes = input<string | null>(null);
  readonly pending = input(false);
  readonly stillPending = input(false);
  readonly primary = input<StkButton | null>(null);
  readonly secondary = input<StkButton | null>(null);

  readonly primaryPressed = output<void>();
  readonly secondaryPressed = output<void>();

  protected readonly copy = STK_COPY;
  protected readonly amountText = computed(() => {
    const a = this.amount();
    return a === null ? null : formatKes(a);
  });
  protected readonly amountSpoken = computed(() => {
    const a = this.amount();
    return a === null ? null : kesSpoken(a);
  });
  protected readonly includesText = computed(() => {
    const inc = this.includes();
    return inc !== null && isPositiveKes(inc) ? formatKes(inc) : null;
  });
}
