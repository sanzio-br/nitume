// `nm-status-chip` (ui-kit spec §4.2.1; Flutter StatusChip C-05).
// Row 33 (decided): the label is blue on every tint; only the dot carries
// the tone colour.
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NmNum } from '../../format/num.directive';
import {
  ErrandStatus,
  StatusPresentation,
  StatusTone,
  customerStatus,
  runnerStatus,
} from '../../status/status-presentation';

export type NmStatusChipSize = 'regular' | 'compact' | 'tag';

@Component({
  selector: 'nm-status-chip',
  imports: [NmNum],
  template: `
    @if (presentation(); as p) {
      <span class="nm-chip" [class]="chipClasses()">
        @if (dot()) {
          <span class="nm-chip__dot" aria-hidden="true"></span>
        }
        <span class="nm-chip__label"
          >{{ p.label }}
          @if (numericSuffix(); as suffix) {
            <span class="nm-chip__sep" aria-hidden="true">· </span><span nmNum>{{ suffix }}</span>
          }
        </span>
      </span>
    }
  `,
  styleUrl: './status-chip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmStatusChip {
  readonly label = input<string | null>(null);
  readonly tone = input<StatusTone | null>(null);
  readonly size = input<NmStatusChipSize>('regular');
  /** Default: shown on regular, hidden on compact and tag. */
  readonly showDot = input<boolean | undefined>(undefined);
  /** Fira Code text after ` · `, e.g. `#NT-10482`. */
  readonly numericSuffix = input<string | null | undefined>(null);

  /** Customer label map (§4.2.3). Mutually exclusive with label/tone. */
  readonly customerStatus = input<ErrandStatus | null | undefined>(undefined);
  /** Runner label map (§4.2.4); renders nothing when the map returns null. */
  readonly runnerStatus = input<ErrandStatus | null | undefined>(undefined);
  readonly offerAccepted = input(true);

  protected readonly presentation = computed<StatusPresentation | null>(() => {
    const customer = this.customerStatus();
    if (customer !== undefined) return customer === null ? null : customerStatus(customer);
    const runner = this.runnerStatus();
    if (runner !== undefined) {
      return runner === null ? null : runnerStatus(runner, { offerAccepted: this.offerAccepted() });
    }
    const label = this.label();
    const tone = this.tone();
    return label && tone ? { label, tone } : null;
  });

  protected readonly dot = computed(() => this.showDot() ?? this.size() === 'regular');

  protected readonly chipClasses = computed(() => {
    const p = this.presentation();
    return `nm-chip nm-chip--${p?.tone ?? 'info'} nm-chip--${this.size()}`;
  });
}
