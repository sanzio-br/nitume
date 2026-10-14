import { Component, input } from '@angular/core';
import { InlineNoticeComponent } from '../../../shared/inline-notice.component';
import { FieldControlDirective, FormFieldComponent } from '../../../shared/form-field.component';
import { formatKshExact } from '../shared-format';
import { EXPOSURE_SCOPE_COPY, ExposureOverrideState, OVERRIDE_NOTE_MAX } from './task-exposure';

/**
 * Row 136 override field: after a 409 `task_exposure_cap_exceeded`, while the
 * amount is still above the task cap, an A-11 info notice with the four
 * figures and the required `Why go over the cap?` note (10-500).
 */
@Component({
  selector: 'app-exposure-override-field',
  imports: [InlineNoticeComponent, FormFieldComponent, FieldControlDirective],
  template: `
    @let st = state();
    @if (st.active() && st.cap(); as cap) {
      @let c = scopeCopy[cap.scope];
      <app-inline-notice tone="info">
        @if (cap.scope === 'item') {
          {{ c.lead }}This is <span class="num">{{ formatKshExact(st.over()) }}</span> above it.
        } @else {
          This is <span class="num">{{ formatKshExact(st.over()) }}</span> above the task cap.
        }
      </app-inline-notice>
      <div class="drawer-card">
        <div class="drawer-row">
          <span>{{ c.total }}</span
          ><b>{{ formatKshExact(cap.totalPaidToNitume) }}</b>
        </div>
        <div class="drawer-row">
          <span>{{ c.refunds }}</span
          ><b>{{ formatKshExact(cap.committedRefunds) }}</b>
        </div>
        <div class="drawer-row">
          <span>{{ c.reimbursements }}</span
          ><b>{{ formatKshExact(cap.committedReimbursements) }}</b>
        </div>
        <div class="drawer-row drawer-row-strong">
          <span>{{ c.remaining }}</span
          ><b>{{ formatKshExact(cap.remaining) }}</b>
        </div>
      </div>
      <app-form-field
        label="Why go over the cap?"
        [hint]="hint()"
        [counter]="st.note().length + '/' + max"
        [error]="st.shownError()"
      >
        <textarea
          appFieldControl
          rows="3"
          [attr.maxlength]="max"
          [value]="st.note()"
          [disabled]="saving()"
          (input)="st.setNote(val($event))"
          (blur)="st.touched.set(true)"
        ></textarea>
      </app-form-field>
    }
  `,
  styles: [':host { display: contents; }'],
})
export class ExposureOverrideFieldComponent {
  readonly state = input.required<ExposureOverrideState>();
  readonly saving = input(false);
  /** `Kept in the audit history. Not shown to the customer.` / `… the runner.` */
  readonly hint = input('Kept in the audit history.');

  protected readonly max = OVERRIDE_NOTE_MAX;
  protected readonly scopeCopy = EXPOSURE_SCOPE_COPY;

  protected val(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  protected readonly formatKshExact = formatKshExact;
}
