// Issue #6 additions to nm-field (auth-foundation §7.1).
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { declared } from '../../../../testing/css';
import { NmField, NmFieldKind } from './field.component';

@Component({
  imports: [NmField],
  template: `
    <nm-field
      label="Phone number"
      [kind]="kind()"
      [hideLabel]="hideLabel()"
      [autocapitalize]="autocapitalize()"
      [spellcheck]="spellcheck()"
    />
  `,
})
class Host {
  readonly kind = signal<NmFieldKind>('text');
  readonly hideLabel = signal(false);
  readonly autocapitalize = signal<string | null>(null);
  readonly spellcheck = signal<boolean | null>(null);
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return {
    host: fixture.componentInstance,
    root,
    input: () => root.querySelector('input, textarea') as HTMLInputElement,
    label: () => root.querySelector('label') as HTMLLabelElement,
    update: () => fixture.detectChanges(),
  };
}

describe('nm-field #6 inputs', () => {
  it('defaults are unchanged: label visible, no autocapitalize or spellcheck attribute', () => {
    const { input, label } = setup();
    expect(label().classList.contains('nm-field__label--hidden')).toBe(false);
    expect(input().hasAttribute('autocapitalize')).toBe(false);
    expect(input().hasAttribute('spellcheck')).toBe(false);
  });

  it('hideLabel keeps the <label for> as the accessible name but hides it visually', () => {
    const { host, input, label, update } = setup();
    host.kind.set('phone');
    host.hideLabel.set(true);
    update();
    expect(label().htmlFor).toBe(input().id);
    expect(input().labels?.[0]?.textContent).toBe('Phone number');
    expect(label().classList.contains('nm-field__label--hidden')).toBe(true);
    expect(getComputedStyle(label()).position).toBe('absolute');
    expect(declared('.nm-field__label--hidden', 'clip-path')).toEqual(['inset(50%)']);
    expect(declared('.nm-field__label--hidden', 'width')).toEqual(['1px']);
  });

  it('autocapitalize and spellcheck bind the native attributes on input and textarea', () => {
    const { host, input, update } = setup();
    host.autocapitalize.set('words');
    host.spellcheck.set(false);
    update();
    expect(input().getAttribute('autocapitalize')).toBe('words');
    expect(input().getAttribute('spellcheck')).toBe('false');
    host.kind.set('multiline');
    update();
    expect(input().tagName).toBe('TEXTAREA');
    expect(input().getAttribute('autocapitalize')).toBe('words');
    expect(input().getAttribute('spellcheck')).toBe('false');
    host.spellcheck.set(true);
    host.autocapitalize.set(null);
    update();
    expect(input().getAttribute('spellcheck')).toBe('true');
    expect(input().hasAttribute('autocapitalize')).toBe(false);
  });
});
