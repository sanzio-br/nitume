// G8-17 (MP T1, T2 at component level): `nm-copy-row`.
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { declared, tokensOnly } from '../../../../testing/css';
import { NmToastService } from '../overlay/toast.service';
import { COPY_ROW_COPY, NM_CLIPBOARD, NmCopyRow } from './copy-row.component';

@Component({
  imports: [NmCopyRow],
  template: `
    <nm-copy-row class="till" label="Till number (Buy Goods)" value="123456" />
    <nm-copy-row class="amount" label="Amount" value="KSh 40,000" valueStyle="amount" copyValue="40000" valueLabel="40,000 shillings" [copyable]="copyable()" />
    <nm-copy-row class="name" label="Merchant" value="Naivas Nyali" valueStyle="text" [copyable]="false" />
  `,
})
class Host {
  readonly copyable = signal(true);
}

function setup(clipboard: Pick<Clipboard, 'writeText'> | null) {
  TestBed.configureTestingModule({ providers: [{ provide: NM_CLIPBOARD, useValue: clipboard }] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement, toast: TestBed.inject(NmToastService) };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('nm-copy-row (G8-17)', () => {
  it('styles. number Code 16/600, amount nmNum amount (Code 20/600) with its spoken label, text Sans 15/600; label 12.5/400 slate-600; padding 12px 0', () => {
    const { root } = setup({ writeText: vi.fn(async () => undefined) });
    const till = root.querySelector('.till .nm-copy-row__value') as HTMLElement;
    expect(till.hasAttribute('nmNum')).toBe(true);
    expect(getComputedStyle(till).fontSize).toBe('16px');
    expect(getComputedStyle(till).fontWeight).toBe('600');
    expect(getComputedStyle(till).fontFamily).toBe('var(--nitume-font-num)');
    const amount = root.querySelector('.amount .nm-copy-row__value') as HTMLElement;
    expect(amount.classList).toContain('nm-num--amount');
    expect(amount.getAttribute('aria-label')).toBe('40,000 shillings');
    const name = root.querySelector('.name .nm-copy-row__value') as HTMLElement;
    expect(name.hasAttribute('nmNum')).toBe(false);
    expect(getComputedStyle(name).fontFamily).toBe('var(--nitume-font-ui)');
    expect(getComputedStyle(name).fontSize).toBe('15px');
    const label = root.querySelector('.till .nm-copy-row__label') as HTMLElement;
    expect(getComputedStyle(label).fontSize).toBe('12.5px');
    expect(getComputedStyle(label).fontWeight).toBe('400');
    expect(getComputedStyle(label).color).toBe('var(--nitume-slate-600)');
    expect(declared('.nm-copy-row', 'padding')).toEqual(['12px 0px']);
    expect(declared('.nm-copy-row__value', 'user-select')).toEqual(['text']);
    expect(tokensOnly()).toBe(true);
  });

  it('Copy. a small text button named `Copy <label>`; none when copyable is false', () => {
    const { fixture, root } = setup({ writeText: vi.fn(async () => undefined) });
    const button = root.querySelector('.till nm-button button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Copy');
    expect(button.getAttribute('aria-label')).toBe('Copy Till number (Buy Goods)');
    expect(button.classList).toContain('nm-btn--text');
    expect(button.classList).toContain('nm-btn--small');
    expect(root.querySelector('.name nm-button')).toBeNull();
    fixture.componentInstance.copyable.set(false);
    fixture.detectChanges();
    expect(root.querySelector('.amount nm-button')).toBeNull();
  });

  it('copy success. writes copyValue (digits only) to the injected clipboard and toasts Copied', async () => {
    const writeText = vi.fn(async () => undefined);
    const { root, toast } = setup({ writeText });
    (root.querySelector('.amount nm-button button') as HTMLButtonElement).click();
    await flush();
    expect(writeText).toHaveBeenCalledWith('40000');
    expect(toast.current()?.message).toBe(COPY_ROW_COPY.copied);
    (root.querySelector('.till nm-button button') as HTMLButtonElement).click();
    await flush();
    expect(writeText).toHaveBeenLastCalledWith('123456');
  });

  it('copy failure. a refusal or a missing clipboard API toasts the copy-failure copy', async () => {
    let s = setup({ writeText: vi.fn(async () => Promise.reject(new Error('denied'))) });
    (s.root.querySelector('.till nm-button button') as HTMLButtonElement).click();
    await flush();
    expect(s.toast.current()?.message).toBe("Couldn't copy. Select the number and copy it.");
    TestBed.resetTestingModule();
    s = setup(null);
    (s.root.querySelector('.till nm-button button') as HTMLButtonElement).click();
    await flush();
    expect(s.toast.current()?.message).toBe(COPY_ROW_COPY.failed);
  });
});
