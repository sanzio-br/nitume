// NR T16 and the G7-28 component minimum for the receipt parts.
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { declared, tokensOnly } from '../../../../testing/css';
import { NmReceiptCaption, NmReceiptGroup, NmReceiptRow } from './receipt.component';

@Component({
  imports: [NmReceiptRow, NmReceiptCaption, NmReceiptGroup],
  template: `
    <nm-receipt-row class="total" label="Estimated total (service + runner fee)" [amount]="total()" [isTotal]="true" amountLabel="2,200 shillings" />
    <nm-receipt-caption>This is an estimate.</nm-receipt-caption>
    <nm-receipt-group>
      <nm-receipt-row class="item" label="Item budget" [amount]="40000" />
    </nm-receipt-group>
  `,
})
class Host {
  readonly total = signal<string | null>('2200.00');
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('receipt parts (NR T16)', () => {
  it('NR T16 row. label in Sans 13 blue; amount via formatKesOrDash in nmNum; isTotal adds 700, the slate-line top rule, margin 6 and padding 10 0 6', () => {
    const { fixture, root } = setup();
    const item = root.querySelector('.item .nm-receipt-row') as HTMLElement;
    const label = item.querySelector('.nm-receipt-row__label') as HTMLElement;
    expect(label.textContent).toBe('Item budget');
    expect(getComputedStyle(label).fontFamily).toBe('var(--nitume-font-ui)');
    expect(getComputedStyle(label).fontSize).toBe('13px');
    expect(getComputedStyle(label).color).toBe('var(--nitume-blue)');
    const amount = item.querySelector('[nmNum]') as HTMLElement;
    expect(amount.textContent?.trim()).toBe('KSh 40,000');
    expect(getComputedStyle(amount).fontFamily).toBe('var(--nitume-font-num)');
    expect(declared('.nm-receipt-row', 'padding')).toEqual(['6px 0px']);
    expect(item.classList.contains('nm-receipt-row--total')).toBe(false);

    const total = root.querySelector('.total .nm-receipt-row') as HTMLElement;
    expect(total.classList.contains('nm-receipt-row--total')).toBe(true);
    expect(declared('.nm-receipt-row--total', 'font-weight')).toEqual(['700']);
    expect(declared('.nm-receipt-row--total', 'border-top')).toEqual(['1px solid var(--nitume-slate-line)']);
    expect(declared('.nm-receipt-row--total', 'margin-top')).toEqual(['6px']);
    expect(declared('.nm-receipt-row--total', 'padding')).toEqual(['10px 0px 6px']);
    fixture.componentInstance.total.set(null);
    fixture.detectChanges();
    expect(total.querySelector('[nmNum]')?.textContent?.trim()).toBe('—');
  });

  it('NR T16 amountLabel. becomes the accessible name of the amount', () => {
    const { root } = setup();
    expect(root.querySelector('.total [nmNum]')?.getAttribute('aria-label')).toBe('2,200 shillings');
    expect(root.querySelector('.item [nmNum]')?.hasAttribute('aria-label')).toBe(false);
  });

  it('NR T16 caption and group. caption uses the greeting values (Sans 12/400 slate-600) with padding-top 8; group hairline, margin 10, padding 4', () => {
    const { root } = setup();
    const caption = root.querySelector('.nm-receipt-caption') as HTMLElement;
    expect(caption.textContent).toBe('This is an estimate.');
    const cs = getComputedStyle(caption);
    expect([cs.fontFamily, cs.fontSize, cs.fontWeight, cs.color]).toEqual([
      'var(--nitume-font-ui)',
      '12px',
      '400',
      'var(--nitume-slate-600)',
    ]);
    expect(declared('.nm-receipt-caption', 'padding-top')).toEqual(['8px']);
    expect(declared('.nm-receipt-group', 'border-top')).toEqual(['1px solid var(--nitume-slate-line)']);
    expect(declared('.nm-receipt-group', 'margin-top')).toEqual(['10px']);
    expect(declared('.nm-receipt-group', 'padding-top')).toEqual(['4px']);
  });

  it('G7-28. not focusable (display only, no focus ring needed); custom-property names only, no hex', () => {
    const { root } = setup();
    expect(root.querySelector('a, button, [tabindex]')).toBeNull();
    expect(tokensOnly()).toBe(true);
  });
});
