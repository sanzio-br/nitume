import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { declared } from '../../../../testing/css';
import { NmOtpField } from './otp-field.component';

@Component({
  imports: [NmOtpField, ReactiveFormsModule],
  template: `
    <nm-otp-field
      [formControl]="control"
      [error]="error()"
      [disabled]="disabled()"
      [autofocus]="false"
      (completed)="completed.push($event)"
    />
  `,
})
class Host {
  readonly control = new FormControl('', { nonNullable: true });
  readonly error = signal<string | null>(null);
  readonly disabled = signal(false);
  readonly completed: string[] = [];
  readonly field = viewChild.required(NmOtpField);
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const input = () => root.querySelector('input') as HTMLInputElement;
  const boxes = () => Array.from(root.querySelectorAll('.nm-otp__box')) as HTMLElement[];
  const type = (value: string) => {
    input().value = value;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const paste = (text: string) => {
    const event = new Event('paste', { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
    input().dispatchEvent(event);
    fixture.detectChanges();
  };
  return { fixture, host: fixture.componentInstance, root, input, boxes, type, paste, update: () => fixture.detectChanges() };
}

describe('nm-otp-field (#6, customer-v-auth-otp T2)', () => {
  it('renders one labelled numeric input over six aria-hidden 44×52 boxes with • placeholders', () => {
    const { input, boxes } = setup();
    expect(boxes()).toHaveLength(6);
    for (const box of boxes()) {
      expect(box.getAttribute('aria-hidden')).toBe('true');
      expect(box.textContent?.trim()).toBe('•');
      expect(getComputedStyle(box).width).toBe('44px');
      expect(getComputedStyle(box).height).toBe('52px');
      expect(getComputedStyle(box).borderRadius).toBe('var(--nitume-r-s)');
      expect(getComputedStyle(box).backgroundColor).toBe('var(--nitume-white)');
    }
    const placeholder = boxes()[0].querySelector('.nm-otp__placeholder') as HTMLElement;
    expect(getComputedStyle(placeholder).color).toBe('var(--nitume-slate-400)');
    expect(getComputedStyle(placeholder).fontFamily).toBe('var(--nitume-font-num)');
    const el = input();
    expect(el.getAttribute('aria-label')).toBe('Verification code, 6 digits');
    expect(el.getAttribute('inputmode')).toBe('numeric');
    expect(el.getAttribute('autocomplete')).toBe('one-time-code');
    expect(el.getAttribute('pattern')).toBe('[0-9]*');
    expect(el.getAttribute('maxlength')).toBe('6');
    expect(el.getAttribute('spellcheck')).toBe('false');
    expect(el.getAttribute('autocorrect')).toBe('off');
  });

  it('typing digits fills boxes in Fira Code 18/600 with green borders; letters are stripped', () => {
    const { input, boxes, type, host } = setup();
    type('1a2b3');
    expect(input().value).toBe('123');
    expect(host.control.value).toBe('123');
    const filled = boxes().slice(0, 3);
    expect(filled.map((b) => b.textContent?.trim())).toEqual(['1', '2', '3']);
    for (const b of filled) expect(b.classList.contains('nm-otp__box--filled')).toBe(true);
    expect(boxes()[3].classList.contains('nm-otp__box--filled')).toBe(false);
    expect(declared('.nm-otp__box--filled', 'border-color')).toEqual(['var(--nitume-green)']);
    expect(declared('.nm-otp__box', 'border')).toEqual(['1px solid var(--nitume-slate-line)']);
    const digit = boxes()[0].querySelector('.nm-otp__digit') as HTMLElement;
    expect(getComputedStyle(digit).fontFamily).toBe('var(--nitume-font-num)');
    expect(getComputedStyle(digit).fontSize).toBe('18px');
    expect(getComputedStyle(digit).fontWeight).toBe('600');
    expect(getComputedStyle(digit).color).toBe('var(--nitume-blue)');
  });

  it('paste keeps the first six digits ("Your code is 123456", "123 456 789")', () => {
    const { paste, host } = setup();
    paste('Your code is 123456');
    expect(host.control.value).toBe('123456');
    paste('123 456 789');
    expect(host.control.value).toBe('123456');
  });

  it('the 6th digit emits completed once; clearing and refilling emits again', () => {
    const { type, host } = setup();
    type('12345');
    expect(host.completed).toEqual([]);
    type('123456');
    type('1234567');
    expect(host.completed).toEqual(['123456']);
    host.field().clear();
    type('654321');
    expect(host.completed).toEqual(['123456', '654321']);
  });

  it('focus ring (2px green, offset 1px) on the box at the next position while focused', () => {
    const { input, boxes, type, update } = setup();
    type('12');
    input().dispatchEvent(new Event('focus'));
    update();
    const focusIdx = boxes().findIndex((b) => b.classList.contains('nm-otp__box--focus'));
    expect(focusIdx).toBe(2);
    expect(declared('.nm-otp__box--focus', 'outline')).toEqual(['2px solid var(--nitume-green)']);
    expect(declared('.nm-otp__box--focus', 'outline-offset')).toEqual(['1px']);
    type('123456');
    expect(boxes().findIndex((b) => b.classList.contains('nm-otp__box--focus'))).toBe(5);
    input().dispatchEvent(new Event('blur'));
    update();
    expect(boxes().some((b) => b.classList.contains('nm-otp__box--focus'))).toBe(false);
  });

  it('error makes every border red and links the role="alert" message with aria-describedby', () => {
    const { host, root, input, boxes, update, type } = setup();
    type('12');
    host.error.set('That code is incorrect. Try again.');
    update();
    for (const b of boxes()) expect(b.classList.contains('nm-otp__box--error')).toBe(true);
    expect(declared('.nm-otp__box--error', 'border-color')).toEqual(['var(--nitume-red)']);
    const message = root.querySelector('.nm-otp__error') as HTMLElement;
    expect(message.getAttribute('role')).toBe('alert');
    expect(message.textContent).toBe('That code is incorrect. Try again.');
    expect(getComputedStyle(message).color).toBe('var(--nitume-red)');
    expect(input().getAttribute('aria-describedby')).toBe(message.id);
    expect(input().getAttribute('aria-invalid')).toBe('true');
  });

  it('disabled disables the input and keeps the boxes; autofocus focuses the input', async () => {
    const { host, input, update } = setup();
    host.disabled.set(true);
    update();
    expect(input().disabled).toBe(true);
    @Component({ imports: [NmOtpField], template: '<nm-otp-field />' })
    class Auto {}
    const f = TestBed.createComponent(Auto);
    document.body.appendChild(f.nativeElement);
    f.detectChanges();
    await f.whenStable();
    expect(document.activeElement).toBe(f.nativeElement.querySelector('input'));
    f.nativeElement.remove();
  });
});
