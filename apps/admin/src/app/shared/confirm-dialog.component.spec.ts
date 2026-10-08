import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfirmDialogComponent } from './confirm-dialog.component';

@Component({
  imports: [ConfirmDialogComponent],
  template: `
    <app-confirm-dialog
      [open]="open()"
      title="Close with no refund?"
      confirmLabel="Close review"
      [busy]="busy()"
      [form]="form()"
      (confirmed)="confirms = confirms + 1"
      (cancelled)="cancels = cancels + 1; open.set(false)"
    >
      <p>Body</p>
      <input data-autofocus id="auto" />
    </app-confirm-dialog>
  `,
})
class HostComponent {
  readonly open = signal(true);
  readonly busy = signal(false);
  readonly form = signal(false);
  confirms = 0;
  cancels = 0;
}

async function render(opts: { busy?: boolean; form?: boolean } = {}) {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.busy.set(!!opts.busy);
  fixture.componentInstance.form.set(!!opts.form);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const buttons = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('.confirm-actions button')) as HTMLButtonElement[];

describe('ConfirmDialogComponent (A-08)', () => {
  it('focuses Back first', async () => {
    const fixture = await render();
    const [back] = buttons(fixture.nativeElement);
    expect(back.textContent?.trim()).toBe('Back');
    expect(document.activeElement).toBe(back);
  });

  it('focuses the autofocus field in form mode', async () => {
    const fixture = await render({ form: true });
    expect(document.activeElement?.id).toBe('auto');
  });

  it('ESC acts as Back and does not reach the document', async () => {
    const fixture = await render();
    const docSpy = vi.fn();
    document.addEventListener('keydown', docSpy);
    const card = fixture.nativeElement.querySelector('.confirm-card') as HTMLElement;
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.removeEventListener('keydown', docSpy);
    expect(fixture.componentInstance.cancels).toBe(1);
    expect(docSpy).not.toHaveBeenCalled();
  });

  it('emits confirmed from the primary button', async () => {
    const fixture = await render();
    const [, confirm] = buttons(fixture.nativeElement);
    expect(confirm.classList).toContain('btn-primary');
    confirm.click();
    expect(fixture.componentInstance.confirms).toBe(1);
  });

  it('while busy: both buttons disabled, Saving… label, cannot dismiss', async () => {
    const fixture = await render({ busy: true });
    const [back, confirm] = buttons(fixture.nativeElement);
    expect(back.disabled).toBe(true);
    expect(confirm.disabled).toBe(true);
    expect(confirm.textContent?.trim()).toBe('Saving…');
    const card = fixture.nativeElement.querySelector('.confirm-card') as HTMLElement;
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    (fixture.nativeElement.querySelector('.confirm-scrim') as HTMLElement).click();
    expect(fixture.componentInstance.cancels).toBe(0);
  });

  it('traps Tab inside the card', async () => {
    const fixture = await render();
    const [back, confirm] = buttons(fixture.nativeElement);
    confirm.focus();
    const card = fixture.nativeElement.querySelector('.confirm-card') as HTMLElement;
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    card.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    // Focus wrapped to the first focusable (the projected input precedes the buttons).
    expect(document.activeElement).not.toBe(confirm);
    expect(back).toBeTruthy();
  });
});
