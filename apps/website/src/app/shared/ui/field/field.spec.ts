import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { cssRuleValues, declared } from '../../../../testing/css';
import { NmField, NmFieldKind } from './field.component';
import { NmFormCard } from './form-card.component';

@Component({
  imports: [NmField, ReactiveFormsModule],
  template: `
    <nm-field
      label="Item budget"
      [kind]="kind()"
      placeholder="e.g. 2,500"
      [error]="error()"
      [maxLength]="maxLength()"
      [counter]="counter()"
      [formControl]="control"
    />
  `,
})
class Host {
  readonly kind = signal<NmFieldKind>('text');
  readonly error = signal<string | null>(null);
  readonly maxLength = signal<number | null>(null);
  readonly counter = signal(false);
  readonly control = new FormControl<string | null>('');
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const host = fixture.componentInstance;
  const root = fixture.nativeElement as HTMLElement;
  const control = () => root.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement;
  const type = (value: string) => {
    control().value = value;
    control().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  return { fixture, host, root, control, type, update: () => fixture.detectChanges() };
}

describe('nm-field (§12.5)', () => {
  it('24. the label is associated with the control; placeholder is slate-400', () => {
    const { root, control } = setup();
    const label = root.querySelector('label') as HTMLLabelElement;
    expect(label.textContent).toBe('Item budget');
    expect(label.htmlFor).toBe(control().id);
    expect(control().labels?.[0]).toBe(label);
    expect(getComputedStyle(label).fontSize).toBe('12.5px');
    expect(getComputedStyle(label).fontWeight).toBe('600');
    expect(getComputedStyle(label).color).toBe('var(--nitume-slate-600)');
    expect(control().getAttribute('placeholder')).toBe('e.g. 2,500');
    expect(cssRuleValues(['.nm-field__input', '::placeholder'], 'color')).toEqual([
      'var(--nitume-slate-400)',
    ]);
    // Field box: white, slate-line, r-s, 11/14 padding, green focus.
    const cs = getComputedStyle(control());
    expect(cs.backgroundColor).toBe('var(--nitume-white)');
    expect(cs.borderRadius).toBe('var(--nitume-r-s)');
    expect(cs.paddingTop).toBe('11px');
    expect(cs.paddingLeft).toBe('14px');
    expect(declared('.nm-field__input', 'border')).toEqual(['1px solid var(--nitume-slate-line)']);
    expect(declared('.nm-field__input:focus', 'border-color')).toEqual(['var(--nitume-green)']);
    expect(declared('.nm-field__input:focus', 'outline')).toEqual(['2px solid var(--nitume-green)']);
    expect(declared('.nm-field__input:focus', 'outline-offset')).toEqual(['1px']);
  });

  it('25. error state: aria-invalid, aria-describedby and a red role="alert" message', () => {
    const { host, root, control, update } = setup();
    expect(control().hasAttribute('aria-invalid')).toBe(false);
    host.error.set('Enter an amount');
    update();
    const message = root.querySelector('.nm-field__error') as HTMLElement;
    expect(message.textContent).toBe('Enter an amount');
    expect(message.getAttribute('role')).toBe('alert');
    expect(getComputedStyle(message).color).toBe('var(--nitume-red)');
    expect(getComputedStyle(message).fontSize).toBe('12.5px');
    expect(control().getAttribute('aria-invalid')).toBe('true');
    expect(control().getAttribute('aria-describedby')).toBe(message.id);
    expect(declared('.nm-field__input--error', 'border-color')).toEqual(['var(--nitume-red)']);
    expect(declared('.nm-field__input--error:focus', 'outline')).toEqual(['2px solid var(--nitume-red)']);
  });

  it('26. multiline grows 3→6 rows; money has a persistent KSh prefix, digits only, Fira Code; phone is tel + Fira Code', () => {
    const { host, root, control, type, update } = setup();

    host.kind.set('multiline');
    update();
    const area = control() as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.rows).toBe(3);
    type('a\nb\nc\nd');
    expect((control() as HTMLTextAreaElement).rows).toBe(4);
    type('1\n2\n3\n4\n5\n6\n7\n8');
    expect((control() as HTMLTextAreaElement).rows).toBe(6);
    expect(getComputedStyle(control()).overflowY).toBe('auto');

    host.kind.set('money');
    host.control.setValue('');
    update();
    const prefix = root.querySelector('.nm-field__prefix') as HTMLElement;
    expect(prefix.textContent).toBe('KSh ');
    expect(getComputedStyle(prefix).fontFamily).toBe('var(--nitume-font-num)');
    expect(getComputedStyle(prefix).color).toBe('var(--nitume-slate-600)');
    expect(control().getAttribute('inputmode')).toBe('numeric');
    expect(getComputedStyle(control()).fontFamily).toBe('var(--nitume-font-num)');
    type('2,5a00');
    expect(control().value).toBe('2500');
    expect(host.control.value).toBe('2500');
    // The prefix stays visible when the field is empty and unfocused.
    type('');
    expect(root.querySelector('.nm-field__prefix')).not.toBeNull();

    host.kind.set('phone');
    update();
    expect(control().getAttribute('type')).toBe('tel');
    expect(control().getAttribute('inputmode')).toBe('tel');
    expect(control().getAttribute('autocomplete')).toBe('tel');
    expect(getComputedStyle(control()).fontFamily).toBe('var(--nitume-font-num)');
    expect(root.querySelector('.nm-field__prefix')).toBeNull();

    host.kind.set('text');
    update();
    expect(getComputedStyle(control()).fontFamily).toBe('var(--nitume-font-ui)');
  });

  it('27. ControlValueAccessor: value in and out, disabled from the form control', () => {
    const { host, control, type, update } = setup();
    host.control.setValue('Milk and bread');
    update();
    expect(control().value).toBe('Milk and bread');
    type('Eggs');
    expect(host.control.value).toBe('Eggs');
    expect(host.control.dirty).toBe(true);
    control().dispatchEvent(new Event('blur'));
    expect(host.control.touched).toBe(true);
    host.control.disable();
    update();
    expect(control().disabled).toBe(true);
    host.control.enable();
    update();
    expect(control().disabled).toBe(false);
  });

  it('28. maxLength counter in Fira Code when enabled', () => {
    const { host, root, control, type, update } = setup();
    host.maxLength.set(140);
    update();
    expect(control().getAttribute('maxlength')).toBe('140');
    expect(root.querySelector('.nm-field__counter')).toBeNull(); // only on request
    host.counter.set(true);
    update();
    type('Hello');
    const counter = root.querySelector('.nm-field__counter') as HTMLElement;
    expect(counter.textContent).toBe('5/140');
    expect(getComputedStyle(counter).fontFamily).toBe('var(--nitume-font-num)');
    expect(getComputedStyle(counter).fontSize).toBe('12px');
    expect(getComputedStyle(counter).color).toBe('var(--nitume-slate-600)');
    expect(getComputedStyle(counter).alignSelf).toBe('flex-end');
  });

  it('nm-form-card: card with a card-label heading above the control', () => {
    @Component({
      imports: [NmFormCard, NmField],
      template: `<nm-form-card label="Pickup"><nm-field placeholder="Address" /></nm-form-card>`,
    })
    class CardHost {}
    const fixture = TestBed.createComponent(CardHost);
    fixture.detectChanges();
    const heading = fixture.nativeElement.querySelector('.nm-form-card__label') as HTMLElement;
    expect(heading.getAttribute('role')).toBe('heading');
    expect(heading.textContent).toBe('Pickup');
    expect(getComputedStyle(heading).textTransform).toBe('uppercase');
    expect(getComputedStyle(heading).fontSize).toBe('11px');
    expect(fixture.nativeElement.querySelector('nm-card nm-field')).not.toBeNull();
  });
});
