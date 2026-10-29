// G8-19 … G8-23 at component level (#8 A§8). The view specs (XQ, VP, MP)
// cover them in place.
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { text } from '../../../../testing/app-harness';
import { accessibleText, declared, tokensOnly } from '../../../../testing/css';
import { ErrandStatus } from '../../../shared/status/status-presentation';
import { NmDeadlineLine } from './deadline-line.component';
import { NmMerchantRouteRows, ROUTE_COPY } from './merchant-route-rows.component';
import { maskPhone } from './payer';
import { NmStkStatus, StkTone } from './stk-status.component';
import { NmTaskSummaryCard } from './task-summary-card.component';
import type { MerchantRoute } from '../data/checkout.api';

const NOW = new Date(2026, 9, 29, 16, 0);

describe('#8 customer shared components', () => {
  it('G8-19 nm-task-summary-card. chip via customerStatus, title or the category display name, meta wholly in nmNum meta-lg; no chip when null', () => {
    @Component({
      imports: [NmTaskSummaryCard],
      template: `<nm-task-summary-card [status]="status()" [title]="title()" category="buy_for_me" reference="NT-10482" [createdAt]="created" [now]="now"><p class="footer">F</p></nm-task-summary-card>`,
    })
    class Host {
      readonly status = signal<ErrandStatus | null>('REQUESTED');
      readonly title = signal<string | null>(null);
      readonly created = new Date(2026, 9, 29, 10, 3).toISOString();
      readonly now = NOW;
    }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(text(root.querySelector('nm-status-chip'))).toBe('Awaiting quote');
    expect(text(root.querySelector('.nm-task-summary__title'))).toBe('Buy For Me');
    const meta = root.querySelector('.nm-task-summary__meta') as HTMLElement;
    expect(meta.hasAttribute('nmNum')).toBe(true);
    expect(meta.classList).toContain('nm-num--meta-lg');
    expect(text(meta)).toBe('#NT-10482 · Today, 10:03 AM');
    expect(text(root.querySelector('.footer'))).toBe('F');
    fixture.componentInstance.status.set(null);
    fixture.componentInstance.title.set('Groceries');
    fixture.detectChanges();
    expect(root.querySelector('nm-status-chip')).toBeNull();
    expect(text(root.querySelector('.nm-task-summary__title'))).toBe('Groceries');
    expect(root.textContent).not.toContain('buy_for_me');
  });

  it('G8-20 nm-deadline-line. `Today, 23:59` in nmNum + ` EAT` outside it (Q8-3), the same in London and Nairobi; null → the Flexible copy; Change emits', () => {
    @Component({
      imports: [NmDeadlineLine],
      template: `<nm-deadline-line [deadlineAt]="at()" [now]="now" [changeable]="true" (change)="changes = changes + 1" />`,
    })
    class Host {
      readonly at = signal<string | null>('2026-11-01T20:59:00.000Z');
      readonly now = new Date('2026-11-01T07:00:00.000Z');
      changes = 0;
    }
    const original = process.env['TZ'];
    try {
      for (const zone of ['Europe/London', 'Africa/Nairobi']) {
        process.env['TZ'] = zone;
        TestBed.resetTestingModule();
        const fixture = TestBed.createComponent(Host);
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        const value = root.querySelector('.nm-deadline-line__value') as HTMLElement;
        expect.soft(text(value), zone).toBe('Today, 23:59 EAT');
        expect.soft(text(value.querySelector('[nmNum]')), zone).toBe('Today, 23:59');
        fixture.componentInstance.at.set('2026-11-02T20:59:00.000Z');
        fixture.detectChanges();
        expect.soft(text(root.querySelector('.nm-deadline-line__value')), zone).toBe('Tomorrow, 23:59 EAT');
        fixture.componentInstance.at.set(null);
        fixture.detectChanges();
        expect.soft(text(root.querySelector('.nm-deadline-line__none')), zone).toBe('No deadline yet. It starts when your payment is confirmed.');
        (root.querySelector('.nm-deadline-line__change button') as HTMLButtonElement).click();
        expect.soft(fixture.componentInstance.changes, zone).toBe(1);
      }
    } finally {
      if (original === undefined) delete process.env['TZ'];
      else process.env['TZ'] = original;
    }
  });

  it('G8-22 nm-merchant-route-rows. exact copy, merchant-direct disabled with the pending subtitle, nothing preselected, no runner_advance', () => {
    @Component({
      imports: [NmMerchantRouteRows],
      template: `<nm-merchant-route-rows [selected]="selected()" [merchantDetailsAvailable]="available()" (selectedChange)="selected.set($event)" />`,
    })
    class Host {
      readonly selected = signal<MerchantRoute | null>(null);
      readonly available = signal(false);
    }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const inputs = () => Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(root.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('How should this be paid?');
    expect(inputs().map((i) => i.value)).toEqual(['merchant_direct', 'send_to_runner']);
    expect(inputs().map((i) => i.getAttribute('aria-label'))).toEqual([
      `${ROUTE_COPY.direct}. Available once the merchant's details are added.`,
      `${ROUTE_COPY.runner}. You'll pay this amount to Nitume by M-Pesa together with the fees, for your runner's purchase.`,
    ]);
    expect(inputs().every((i) => !i.checked)).toBe(true);
    expect(inputs()[0].getAttribute('aria-disabled')).toBe('true');
    expect(root.textContent).not.toMatch(/advance/i);
    fixture.componentInstance.available.set(true);
    fixture.detectChanges();
    expect(inputs()[0].disabled).toBe(false);
    expect(inputs()[0].getAttribute('aria-label')).toBe(
      "Pay merchant directly (recommended). You'll see the merchant's Till or Paybill number after paying the fees.",
    );
    inputs()[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toBe('send_to_runner');
  });

  it('G8-23 nm-stk-status. icon circle per tone (red never a surface), live heading, payer in nmNum, amount with spoken label, Includes only when > 0, dots, 220px buttons', () => {
    @Component({
      imports: [NmStkStatus],
      template: `<nm-stk-status
        [tone]="tone()"
        heading="Check your phone"
        body="Enter your M-Pesa PIN on the prompt sent to "
        payer="+254 712 345 678"
        bodyEnd=" to confirm this payment."
        [amount]="amount()"
        [includes]="includes()"
        [pending]="true"
        [primary]="{ label: 'I\\'ve paid — continue' }"
        (primaryPressed)="presses = presses + 1"
      />`,
    })
    class Host {
      readonly tone = signal<StkTone>('waiting');
      readonly amount = signal<string | null>('41100.00');
      readonly includes = signal<string | null>('40000.00');
      presses = 0;
    }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.nm-stk__circle nm-icon')?.getAttribute('data-icon')).toBe('phone');
    expect(declared('.nm-stk__circle--waiting', 'background-color')).toEqual(['var(--nitume-green-050)']);
    expect(declared('.nm-stk__circle--failed', 'background-color')).toEqual(['var(--nitume-slate)']);
    expect(declared('.nm-stk__circle--failed', 'color')).toEqual(['var(--nitume-blue)']);
    expect(root.querySelector('[aria-live="polite"] h2')?.textContent).toBe('Check your phone');
    expect(text(root.querySelector('.nm-stk__body'))).toBe('Enter your M-Pesa PIN on the prompt sent to +254 712 345 678 to confirm this payment.');
    expect(root.querySelector('.nm-stk__payer')?.hasAttribute('nmNum')).toBe(true);
    const amount = root.querySelector('.nm-stk__amount') as HTMLElement;
    expect(amount.textContent).toBe('KSh 41,100');
    expect(amount.classList).toContain('nm-num--amount-lg');
    expect(amount.getAttribute('aria-label')).toBe('41,100 shillings');
    expect(text(root.querySelector('.nm-stk__includes'))).toBe("Includes KSh 40,000 for your runner's purchase.");
    expect(root.querySelector('.nm-stk__includes [nmNum]')?.textContent).toBe('KSh 40,000');
    expect(root.querySelector('nm-pulsing-dots')).not.toBeNull();
    expect(declared('.nm-stk__actions', 'width')).toEqual(['220px']);
    (root.querySelector('.nm-stk__primary button') as HTMLButtonElement).click();
    expect(fixture.componentInstance.presses).toBe(1);
    fixture.componentInstance.includes.set('0.00');
    fixture.componentInstance.tone.set('success');
    fixture.detectChanges();
    expect(root.querySelector('.nm-stk__includes')).toBeNull();
    expect(root.querySelector('.nm-stk__circle nm-icon')?.getAttribute('data-icon')).toBe('check');
    fixture.componentInstance.amount.set(null);
    fixture.detectChanges();
    expect(root.querySelector('.nm-stk__amount')).toBeNull();
    expect(accessibleText(root)).not.toMatch(/wallet|escrow/i);
    expect(tokensOnly()).toBe(true);
  });

  it('maskPhone. +254 712 ••• 678 for a Kenyan mobile; anything else unchanged', () => {
    expect(maskPhone('+254712345678')).toBe('+254 712 ••• 678');
    expect(maskPhone('0712345678')).toBe('+254 712 ••• 678');
    expect(maskPhone('12345')).toBe('12345');
  });
});
