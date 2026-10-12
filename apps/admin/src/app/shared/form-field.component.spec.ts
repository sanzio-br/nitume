import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FieldControlDirective, FormFieldComponent } from './form-field.component';

@Component({
  imports: [FormFieldComponent, FieldControlDirective],
  template: `
    <app-form-field
      label="Refund amount"
      hint="Between KSh 0 and KSh 1,200."
      [error]="error()"
      prefix="KSh"
      counter="0/1000"
    >
      <input appFieldControl [numeric]="true" />
    </app-form-field>
  `,
})
class HostComponent {
  readonly error = signal<string | null>(null);
}

describe('FormFieldComponent (A-06)', () => {
  it('links the label, hint and error to the control', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input')!;
    const label = el.querySelector('label')!;
    expect(label.getAttribute('for')).toBe(input.id);
    expect(input.classList).toContain('field-input');
    expect(input.classList).toContain('is-numeric');
    const hint = el.querySelector('.field-hint')!;
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(el.querySelector('.field-prefix')?.textContent).toBe('KSh');
    expect(el.querySelector('.field-counter')?.textContent).toBe('0/1000');

    fixture.componentInstance.error.set('Enter a refund amount, or KSh 0 for no refund.');
    fixture.detectChanges();
    const error = el.querySelector('.field-error')!;
    expect(input.getAttribute('aria-describedby')).toBe(`${error.id} ${hint.id}`);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.classList).toContain('is-invalid');
  });

  it('sets the numeric data in the hint in Fira Code, the words in Fira Sans', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const hint = (fixture.nativeElement as HTMLElement).querySelector('.field-hint')!;
    expect(hint.textContent).toBe('Between KSh 0 and KSh 1,200.');
    expect(Array.from(hint.querySelectorAll('.num'), (n) => n.textContent)).toEqual([
      'KSh 0',
      'KSh 1,200',
    ]);
  });
});
