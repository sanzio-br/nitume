import { Component, Directive, computed, inject, input } from '@angular/core';
import { NumTextComponent, TextPart } from './num-text.component';

let nextId = 0;

/**
 * Design-system form field (A-06): visible label, projected control, hint,
 * optional Fira Code counter and a text-only error. Put `appFieldControl`
 * on the projected input/textarea/select: it gets the id, `.field-input`,
 * `aria-describedby` (error + hint) and `aria-invalid`.
 *
 * Numeric data inside the hint (amounts, receipts) renders in Fira Code;
 * `plainHint` opts out when the digits are a rule, not data.
 *
 * `prefix` renders a static Fira Sans prefix inside the field (money inputs:
 * `KSh`); the value text of a money input is Fira Code (`numeric`).
 */
@Component({
  selector: 'app-form-field',
  imports: [NumTextComponent],
  template: `
    <div class="field">
      <label class="field-label" [class.sr-only]="hideLabel()" [attr.for]="controlId">{{
        label()
      }}</label>
      <div class="field-control" [class.has-prefix]="!!prefix()">
        @if (prefix()) {
          <span class="field-prefix" aria-hidden="true">{{ prefix() }}</span>
        }
        <ng-content />
      </div>
      @if (hasHint() || counter()) {
        <div class="field-foot">
          <span class="field-hint" [id]="hintId">
            @if (hintParts(); as parts) {
              <app-num-text [parts]="parts" />
            } @else if (plainHint()) {
              {{ hint() }}
            } @else {
              <app-num-text [text]="hint()" />
            }
          </span>
          @if (counter()) {
            <span class="field-counter" [class.is-error]="counterError()">{{ counter() }}</span>
          }
        </div>
      }
      @if (error()) {
        <div class="field-error" [id]="errorId">{{ error() }}</div>
      }
    </div>
  `,
  styles: [':host { display: block; }'],
})
export class FormFieldComponent {
  readonly label = input<string>('');
  readonly hint = input<string>('');
  /** Hint is a rule, not data (e.g. `At least 20 characters`): all Fira Sans. */
  readonly plainHint = input(false);
  /**
   * Hint as explicit parts, for data the numeric pattern can't be trusted to
   * catch (e.g. a 4-character or all-letter M-Pesa code). Wins over `hint`.
   */
  readonly hintParts = input<TextPart[] | null>(null);
  protected readonly hasHint = computed(() => !!this.hint() || !!this.hintParts()?.length);
  readonly error = input<string | null>(null);
  readonly counter = input<string>('');
  readonly counterError = input(false);
  readonly prefix = input<string>('');
  readonly hideLabel = input(false);

  private readonly uid = ++nextId;
  readonly controlId = `ff-${this.uid}`;
  readonly hintId = `ff-${this.uid}-hint`;
  readonly errorId = `ff-${this.uid}-error`;

  readonly describedBy = computed(() => {
    const ids: string[] = [];
    if (this.error()) ids.push(this.errorId);
    if (this.hasHint()) ids.push(this.hintId);
    return ids.length ? ids.join(' ') : null;
  });
}

/** Wires a projected control into its `app-form-field` (see above). */
@Directive({
  selector: '[appFieldControl]',
  host: {
    class: 'field-input',
    '[id]': 'field.controlId',
    '[attr.aria-describedby]': 'field.describedBy()',
    '[attr.aria-invalid]': 'field.error() ? "true" : null',
    '[class.is-invalid]': '!!field.error()',
    '[class.is-numeric]': 'numeric()',
  },
})
export class FieldControlDirective {
  protected readonly field = inject(FormFieldComponent);
  /** Fira Code value text (amounts, Till/Paybill numbers, receipts). */
  readonly numeric = input(false);
}
