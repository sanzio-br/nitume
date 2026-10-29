// `nmFieldValue`: binds a value-accessor control (nm-field, nm-otp-field)
// without @angular/forms directives, whose code would otherwise land in the
// marketing initial bundle (WQ-33, owner 2026-10-29).
//   <nm-field [nmFieldValue]="phone()" (nmFieldValueChange)="phone.set($event)" />
// The input is the initial value; changes come out of the output.
import { Directive, OnInit, inject, input, output } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Directive({ selector: '[nmFieldValue]' })
export class NmFieldValue implements OnInit {
  readonly nmFieldValue = input('');
  readonly nmFieldValueChange = output<string>();

  private readonly accessor = (inject(NG_VALUE_ACCESSOR, { self: true }) as ControlValueAccessor[])[0];

  ngOnInit(): void {
    this.accessor.writeValue(this.nmFieldValue());
    this.accessor.registerOnChange((value: string) => this.nmFieldValueChange.emit(value));
    this.accessor.registerOnTouched(() => undefined);
  }
}
