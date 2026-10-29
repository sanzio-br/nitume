// `nmFieldValue`: binds a value-accessor control (nm-field, nm-otp-field)
// without @angular/forms directives, whose code would otherwise land in the
// marketing initial bundle (WQ-33, owner 2026-10-29).
//   <nm-field [nmFieldValue]="phone()" (nmFieldValueChange)="phone.set($event)" />
// The input is written on init; changes come out of the output. A later
// change of the input is written too (#7, §W9a: a picked place, a reset),
// unless it equals what the control already holds (typing round-trips
// without a write, so the caret never jumps).
import { Directive, OnChanges, OnInit, SimpleChanges, inject, input, output } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Directive({ selector: '[nmFieldValue]' })
export class NmFieldValue implements OnInit, OnChanges {
  readonly nmFieldValue = input('');
  readonly nmFieldValueChange = output<string>();

  private readonly accessor = (inject(NG_VALUE_ACCESSOR, { self: true }) as ControlValueAccessor[])[0];

  /** The value the control holds: last written or last emitted. */
  private current: string | null = null;

  ngOnInit(): void {
    this.current = this.nmFieldValue();
    this.accessor.writeValue(this.current);
    this.accessor.registerOnChange((value: string) => {
      this.current = value;
      this.nmFieldValueChange.emit(value);
    });
    this.accessor.registerOnTouched(() => undefined);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['nmFieldValue'];
    if (!change || change.firstChange) return;
    const next = this.nmFieldValue();
    if (next === this.current) return;
    this.current = next;
    this.accessor.writeValue(next);
  }
}
