// `nm-copy-row` (#8; customer-x-merchant-payment §Components; Flutter C-39
// `CopyableValueRow`). A label (12.5 slate-600) over a selectable value
// (`number` Code 16/600, `amount` Code 20/600, `text` Sans 15/600) and a
// small text `Copy` button named `Copy <label>`. Copying goes through
// `NM_CLIPBOARD` (default `navigator.clipboard`); success toasts `Copied`,
// a refusal or a missing clipboard API the copy-failure toast. Toasts sit
// above a fixed CTA (`NmFixedCtaOffset`).
import { ChangeDetectionStrategy, Component, InjectionToken, computed, inject, input } from '@angular/core';
import { NmNum } from '../../format/num.directive';
import { NmButton } from '../button/button.component';
import { NmFixedCtaOffset } from '../fixed-cta/fixed-cta.component';
import { NmToastService } from '../overlay/toast.service';

/** The clipboard the row writes to; null when the browser has none. */
export const NM_CLIPBOARD = new InjectionToken<Pick<Clipboard, 'writeText'> | null>('NM_CLIPBOARD', {
  providedIn: 'root',
  factory: () => (typeof navigator !== 'undefined' && navigator.clipboard ? navigator.clipboard : null),
});

export const COPY_ROW_COPY = {
  copied: 'Copied',
  failed: "Couldn't copy. Select the number and copy it.",
} as const;

export type NmCopyRowStyle = 'number' | 'amount' | 'text';

@Component({
  selector: 'nm-copy-row',
  imports: [NmNum, NmButton],
  template: `
    <div class="nm-copy-row">
      <div class="nm-copy-row__text">
        <span class="nm-copy-row__label">{{ label() }}</span>
        @switch (valueStyle()) {
          @case ('text') {
            <span class="nm-copy-row__value nm-copy-row__value--text">{{ value() }}</span>
          }
          @case ('amount') {
            <span class="nm-copy-row__value" nmNum="amount" [nmNumLabel]="valueLabel()">{{ value() }}</span>
          }
          @default {
            <span class="nm-copy-row__value nm-copy-row__value--number" nmNum>{{ value() }}</span>
          }
        }
      </div>
      @if (copyable()) {
        <nm-button class="nm-copy-row__copy" variant="text" size="small" [ariaLabel]="copyName()" (pressed)="copy()">Copy</nm-button>
      }
    </div>
  `,
  styleUrl: './copy-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmCopyRow {
  readonly label = input.required<string>();
  /** Shown value (e.g. `KSh 40,000`). */
  readonly value = input.required<string>();
  readonly valueStyle = input<NmCopyRowStyle>('number');
  /** Copied text when it differs from `value` (e.g. `40000`). */
  readonly copyValue = input<string | null>(null);
  readonly copyable = input(true);
  /** Accessible name of the value (e.g. `kesSpoken(amount)`). */
  readonly valueLabel = input<string | null>(null);

  private readonly clipboard = inject(NM_CLIPBOARD);
  private readonly toast = inject(NmToastService);
  private readonly offsets = inject(NmFixedCtaOffset);

  protected readonly copyName = computed(() => `Copy ${this.label()}`);

  protected async copy(): Promise<void> {
    const text = this.copyValue() ?? this.value();
    let ok = false;
    try {
      if (this.clipboard) {
        await this.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    this.toast.show(ok ? COPY_ROW_COPY.copied : COPY_ROW_COPY.failed, { offset: this.offsets.toastOffset() });
  }
}
