import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, errandFixture, flushAsync, setupHttp } from '../../../testing/admin-test-utils';
import { DisputeDrawerComponent, rationaleValid, verdictEntry } from './dispute-drawer';

const ID = errandFixture().id;
const NOTE = 'Photos show the wrong item was delivered to the customer.';

describe('dispute rationale rule (G-20)', () => {
  it('needs 20 trimmed characters', () => {
    expect(rationaleValid('a'.repeat(19))).toBe(false);
    expect(rationaleValid('  ' + 'a'.repeat(19) + '  ')).toBe(false);
    expect(rationaleValid('a'.repeat(20))).toBe(true);
    expect(rationaleValid('a'.repeat(2001))).toBe(false);
  });

  it('finds the verdict row in history', () => {
    expect(
      verdictEntry([
        {
          id: '1',
          errandId: ID,
          fromStatus: 'COMPLETED',
          toStatus: 'DISPUTED',
          actorType: 'customer',
          createdAt: 'a',
        },
        {
          id: '2',
          errandId: ID,
          fromStatus: 'DISPUTED',
          toStatus: 'CANCELLED',
          actorType: 'admin',
          note: 'n',
          createdAt: 'b',
        },
      ])?.id,
    ).toBe('2');
    expect(verdictEntry([])).toBeNull();
  });
});

describe('DisputeDrawerComponent (G-6, G-19..G-22)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  async function render(status: string, history: unknown[] = []) {
    const fixture = TestBed.createComponent(DisputeDrawerComponent);
    fixture.componentRef.setInput('errandId', ID);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    http.expectOne(`${API}/errands/${ID}`).flush(errandFixture({ status: status as never }));
    http.expectOne(`${API}/errands/${ID}/history`).flush(history);
    http.expectOne(`${API}/errands/${ID}/dispute`).flush({
      id: 'd1',
      errandId: ID,
      openedBy: 'u',
      reason: 'The runner delivered the wrong brand of milk.',
      status: 'open',
      resolution: null,
      resolvedBy: null,
      createdAt: '2026-10-08T07:00:00Z',
    });
    await flushAsync();
    fixture.detectChanges();
    return fixture;
  }
  const buttons = (el: HTMLElement, text: string) =>
    Array.from(el.querySelectorAll('button')).filter((b) => b.textContent?.trim() === text);
  function type(fixture: { nativeElement: HTMLElement; detectChanges(): void }, value: string) {
    const ta = fixture.nativeElement.querySelector('textarea')!;
    ta.value = value;
    ta.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it("shows the dispute reason as the customer's claim, not the task brief", async () => {
    const fixture = await render('DISPUTED');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Customer's claim");
    expect(text).toContain('The runner delivered the wrong brand of milk.');
    expect(text).not.toContain('Buy groceries at Naivas');
  });

  it('uses outline + primary buttons, disabled until 20 characters', async () => {
    const fixture = await render('DISPUTED');
    const el = fixture.nativeElement as HTMLElement;
    const [runner] = buttons(el, 'Side with runner');
    const [customer] = buttons(el, 'Side with customer');
    expect(runner.className).toBe('btn btn-outline');
    expect(customer.className).toBe('btn btn-primary');
    expect(runner.disabled).toBe(true);
    type(fixture, 'too short');
    expect(customer.disabled).toBe(true);
    type(fixture, NOTE);
    expect(runner.disabled).toBe(false);
    expect(customer.disabled).toBe(false);
  });

  it('never claims "resolved" when the request fails, and keeps the note', async () => {
    const fixture = await render('DISPUTED');
    const el = fixture.nativeElement as HTMLElement;
    type(fixture, NOTE);
    buttons(el, 'Side with runner')[0].click();
    fixture.detectChanges();
    // Confirm in A-08 (the dialog's primary button).
    buttons(el, 'Side with runner').at(-1)!.click();
    http
      .expectOne(`${API}/errands/${ID}/resolve-dispute`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await flushAsync();
    fixture.detectChanges();
    const text = el.textContent as string;
    expect(text).toContain("Couldn't record the decision. Try again.");
    expect(text).not.toContain('Dispute resolved');
    expect(el.querySelector('textarea')!.value).toBe(NOTE);
    expect(buttons(el, 'Side with runner')[0].disabled).toBe(false);
  });

  it('builds the outcome from the response and links the refund review', async () => {
    const fixture = await render('DISPUTED');
    const el = fixture.nativeElement as HTMLElement;
    type(fixture, NOTE);
    buttons(el, 'Side with customer')[0].click();
    fixture.detectChanges();
    buttons(el, 'Side with customer').at(-1)!.click();
    const req = http.expectOne(`${API}/errands/${ID}/resolve-dispute`);
    expect(req.request.body).toEqual({ verdict: 'customer', rationale: NOTE });
    req.flush({
      errand: errandFixture({ status: 'CANCELLED' }),
      history: {
        id: 'h9',
        errandId: ID,
        fromStatus: 'DISPUTED',
        toStatus: 'CANCELLED',
        actorType: 'admin',
        note: NOTE,
        createdAt: '2026-10-08T09:00:00Z',
      },
    });
    await flushAsync();
    http.expectOne(`${API}/errands/${ID}/refund`).flush({
      id: 'r1',
      errandId: ID,
      trigger: 'dispute_customer_favourable',
      status: 'pending_review',
      amountPaid: '1450.00',
      refundAmount: null,
      createdAt: '2026-10-08T09:00:00Z',
    });
    await flushAsync();
    http.match(() => true).forEach((r) => r.flush({ count: 1 }));
    fixture.detectChanges();
    const text = el.textContent as string;
    expect(text).toContain('Outcome');
    expect(text).toContain('Cancelled');
    expect(text).toContain(
      'Dispute resolved for the customer. The task is now Cancelled. A refund review is waiting in Refunds.',
    );
    expect(buttons(el, 'Open refund review')).toHaveLength(1);
    // m-4: the result notice sits under the Outcome card.
    const outcome = Array.from(el.querySelectorAll('.drawer-label')).find(
      (l) => l.textContent === 'Outcome',
    )!;
    const notice = el.querySelector('.notice')!;
    expect(outcome.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(el.querySelector('textarea')).toBeNull();
  });

  it('opens on a resolved task with the recorded outcome and no form', async () => {
    const fixture = await render('COMPLETED', [
      {
        id: 'h2',
        errandId: ID,
        fromStatus: 'DISPUTED',
        toStatus: 'COMPLETED',
        actorType: 'admin',
        note: NOTE,
        createdAt: '2026-10-08T08:00:00Z',
      },
    ]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Outcome');
    expect(el.textContent).toContain(NOTE);
    expect(el.querySelector('textarea')).toBeNull();
    expect(el.textContent).not.toContain('Dispute resolved');
  });

  it('a 404 shows an info notice without Try again (m-3)', async () => {
    const fixture = TestBed.createComponent(DisputeDrawerComponent);
    fixture.componentRef.setInput('errandId', ID);
    fixture.detectChanges();
    http.expectOne(`${API}/errands/${ID}`).flush(null, { status: 404, statusText: 'Not Found' });
    http.expectOne(`${API}/errands/${ID}/history`).flush([]);
    http
      .expectOne(`${API}/errands/${ID}/dispute`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    await flushAsync();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('This task no longer exists.');
    expect(el.querySelector('.notice .chip')?.classList).toContain('chip-info');
    expect(buttons(el, 'Try again')).toHaveLength(0);
  });
});
