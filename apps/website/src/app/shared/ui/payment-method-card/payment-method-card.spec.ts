// A.T12 (G8-16): `nm-payment-method-card`.
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { declared, tokensOnly } from '../../../../testing/css';
import { NmPaymentMethodCard } from './payment-method-card.component';

@Component({
  imports: [NmPaymentMethodCard],
  template: `<nm-payment-method-card label="M-Pesa" detail="+254 712 ••• 678"><button nmPaymentTrailing type="button" class="change">Change</button></nm-payment-method-card>`,
})
class Host {}

describe('nm-payment-method-card (A.T12, G8-16)', () => {
  it('A.T12. M-PESA badge in WHITE tag text on the green token, 38×26, radius 5', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const badge = (fixture.nativeElement as HTMLElement).querySelector('.nm-payment-method-card__badge') as HTMLElement;
    expect(badge.textContent).toBe('M-PESA');
    expect(declared('.nm-payment-method-card__badge', 'background-color')).toEqual(['var(--nitume-green)']);
    expect(getComputedStyle(badge).color).toBe('var(--nitume-white)');
    expect(getComputedStyle(badge).fontSize).toBe('10px');
    expect(getComputedStyle(badge).fontWeight).toBe('700');
    expect(declared('.nm-payment-method-card__badge', 'width')).toEqual(['38px']);
    expect(declared('.nm-payment-method-card__badge', 'height')).toEqual(['26px']);
    expect(declared('.nm-payment-method-card__badge', 'border-radius')).toEqual(['5px']);
  });

  it('A.T12. label in row-title, the detail in nmNum meta, the trailing slot projected; white row, slate-line border, r-m, padding 14px 15px', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const label = root.querySelector('.nm-payment-method-card__label') as HTMLElement;
    expect(label.textContent).toBe('M-Pesa');
    expect(getComputedStyle(label).fontSize).toBe('13.5px');
    const detail = root.querySelector('.nm-payment-method-card__detail') as HTMLElement;
    expect(detail.hasAttribute('nmNum')).toBe(true);
    expect(detail.classList).toContain('nm-num--meta');
    expect(detail.textContent).toBe('+254 712 ••• 678');
    expect(getComputedStyle(detail).fontFamily).toBe('var(--nitume-font-num)');
    expect(root.querySelector('.nm-payment-method-card__trailing .change')?.textContent).toBe('Change');
    expect(declared('.nm-payment-method-card', 'background-color')).toEqual(['var(--nitume-white)']);
    expect(declared('.nm-payment-method-card', 'border')).toEqual(['1px solid var(--nitume-slate-line)']);
    expect(declared('.nm-payment-method-card', 'border-radius')).toEqual(['var(--nitume-r-m)']);
    expect(declared('.nm-payment-method-card', 'padding')).toEqual(['14px 15px']);
    expect(tokensOnly()).toBe(true);
  });
});
