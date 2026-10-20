import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, errandFixture, flushAsync, setupHttp } from '../../../testing/admin-test-utils';
import {
  AMOUNT_ERROR,
  buildQuoteBody,
  EXPIRY_ERROR,
  OUTSIDE_SERVICE_AREA_COPY,
  QuoteForm,
  quoteExpired,
  TOTAL_ERROR,
  validateQuoteForm,
} from './quote-dialog';
import { canRequote, pendingQuoteRequest, QuoteSectionComponent } from './quote.section';
import { QuoteDialogComponent } from './quote-dialog';
import { eatLocalInputToIso } from '../shared-format';
import type { Quote } from '../../../core/api-types';
import { AdminDataService } from '../admin-data.service';

const NOW = new Date('2026-10-08T09:00:00Z');

function form(patch: Partial<QuoteForm> = {}): QuoteForm {
  return {
    total: '1,450',
    components: {
      baseFee: '',
      distanceFee: '',
      timeFee: '',
      urgencyFee: '',
      complexityFee: '',
      premiumFee: '',
    },
    expiresAt: '2026-10-09T12:00',
    note: '',
    ...patch,
  };
}

function quote(patch: Partial<Quote> = {}): Quote {
  return {
    id: 'q1',
    errandId: errandFixture().id,
    baseFee: '1000.00',
    distanceFee: '450.00',
    timeFee: '0',
    urgencyFee: '0',
    complexityFee: '0',
    premiumFee: '0',
    total: '1450.00',
    currency: 'KES',
    expiresAt: '2026-10-08T08:00:00Z',
    createdAt: '2026-10-07T08:00:00Z',
    ...patch,
  };
}

describe('quote form (G-15)', () => {
  it('sends numbers only, omits empty components and currency, converts EAT to UTC (row 96)', () => {
    const body = buildQuoteBody(
      form({
        components: { ...form().components, baseFee: '1,000', distanceFee: '450.5' },
        note: '  traffic  ',
      }),
    );
    expect(body).toEqual({
      total: 1450,
      baseFee: 1000,
      distanceFee: 450.5,
      // 12:00 EAT typed → 09:00 UTC sent.
      expiresAt: '2026-10-09T09:00:00.000Z',
      note: 'traffic',
    });
    expect(typeof body.total).toBe('number');
    expect('timeFee' in body).toBe(false);
    expect('currency' in body).toBe(false);
  });

  it('validates total, components and expiry', () => {
    expect(validateQuoteForm(form(), NOW)).toEqual({});
    expect(validateQuoteForm(form({ total: '' }), NOW).total).toBe(TOTAL_ERROR);
    expect(validateQuoteForm(form({ total: '0.5' }), NOW).total).toBe(TOTAL_ERROR);
    expect(validateQuoteForm(form({ total: '10000001' }), NOW).total).toBe(TOTAL_ERROR);
    expect(validateQuoteForm(form({ total: '1.234' }), NOW).total).toBe(TOTAL_ERROR);
    expect(
      validateQuoteForm(form({ components: { ...form().components, timeFee: 'x' } }), NOW).timeFee,
    ).toBe(AMOUNT_ERROR);
    // 12:04 EAT is less than 5 minutes after 12:00 EAT (NOW).
    expect(validateQuoteForm(form({ expiresAt: '2026-10-08T12:04' }), NOW).expiresAt).toBe(
      EXPIRY_ERROR,
    );
    expect(validateQuoteForm(form({ expiresAt: '' }), NOW).expiresAt).toBe(EXPIRY_ERROR);
  });
});

describe('QuoteDialogComponent expiry (row 83)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  function open() {
    const fixture = TestBed.createComponent(QuoteDialogComponent);
    fixture.componentRef.setInput('errandId', errandFixture().id);
    fixture.componentRef.setInput('open', true);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const expiry = el.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    const confirm = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Issue quote',
    ) as HTMLButtonElement;
    return { fixture, el, expiry, confirm };
  }

  it('defaults Valid until to 24 hours from now (EAT)', () => {
    const { expiry } = open();
    const iso = eatLocalInputToIso(expiry.value);
    expect(iso).not.toBeNull();
    const delta = new Date(iso!).getTime() - Date.now();
    expect(Math.abs(delta - 24 * 3600 * 1000)).toBeLessThan(2 * 60 * 1000);
  });

  it('cannot be issued without an expiry; the body always carries expiresAt', async () => {
    const { fixture, el, expiry, confirm } = open();
    const total = el.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    total.value = '1450';
    total.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(confirm.disabled).toBe(false);

    const kept = expiry.value;
    expiry.value = '';
    expiry.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(confirm.disabled).toBe(true);

    expiry.value = kept;
    expiry.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    confirm.click();
    const req = http.expectOne(`${API}/errands/${errandFixture().id}/quote`);
    expect(req.request.body.expiresAt).toBe(eatLocalInputToIso(kept));
    expect(req.request.body.expiresAt).toMatch(/Z$/);
    req.flush(null, { status: 500, statusText: 'Server Error' });
    await flushAsync();
  });
});

describe('QuoteDialogComponent errors (row 83)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  it('maps 400 quote_expiry_in_past to the Valid until field', async () => {
    const fixture = TestBed.createComponent(QuoteDialogComponent);
    fixture.componentRef.setInput('errandId', errandFixture().id);
    fixture.componentRef.setInput('open', true);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const total = el.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    total.value = '1450';
    total.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Issue quote')!
      .click();
    http
      .expectOne(`${API}/errands/${errandFixture().id}/quote`)
      .flush(
        { statusCode: 400, code: 'quote_expiry_in_past', message: 'x' },
        { status: 400, statusText: 'Bad Request' },
      );
    await flushAsync();
    fixture.detectChanges();
    expect(el.textContent).toContain('The expiry time has passed. Choose a later time.');
    expect(el.textContent).not.toContain('Check the amounts');
    expect(el.querySelector('.field-error')?.textContent).toContain(EXPIRY_ERROR);
  });

  it('maps 422 location_outside_service_area to the spec copy and keeps the dialog open (row 233)', async () => {
    const fixture = TestBed.createComponent(QuoteDialogComponent);
    fixture.componentRef.setInput('errandId', errandFixture().id);
    fixture.componentRef.setInput('open', true);
    document.body.appendChild(fixture.nativeElement);
    const issued = vi.fn();
    const conflict = vi.fn();
    fixture.componentInstance.issued.subscribe(issued);
    fixture.componentInstance.conflict.subscribe(conflict);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const total = el.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    total.value = '1450';
    total.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Issue quote')!
      .click();
    http.expectOne(`${API}/errands/${errandFixture().id}/quote`).flush(
      {
        statusCode: 422,
        code: 'location_outside_service_area',
        message: 'This location is outside the areas we serve. API copy.',
        pointType: 'task_site',
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await flushAsync();
    fixture.detectChanges();
    expect(el.textContent).toContain(OUTSIDE_SERVICE_AREA_COPY);
    expect(el.textContent).not.toContain('API copy');
    expect(el.textContent).not.toContain("Couldn't issue the quote");
    expect(issued).not.toHaveBeenCalled();
    expect(conflict).not.toHaveBeenCalled();
    expect(
      Array.from(el.querySelectorAll('button')).some(
        (b) => b.textContent?.trim() === 'Issue quote',
      ),
    ).toBe(true);
  });
});

describe('re-quote visibility (G-5)', () => {
  const now = NOW.getTime();

  it('detects expiry like the API (expiresAt <= now; null never expires)', () => {
    expect(quoteExpired(quote({ expiresAt: '2026-10-08T09:00:00Z' }), now)).toBe(true);
    expect(quoteExpired(quote({ expiresAt: '2026-10-08T09:00:01Z' }), now)).toBe(false);
    expect(quoteExpired(quote({ expiresAt: null }), now)).toBe(false);
    expect(quoteExpired(null, now)).toBe(false);
  });

  it('offers Issue new quote only for an expired QUOTED quote', () => {
    expect(canRequote(errandFixture({ status: 'QUOTED' }), quote(), now)).toBe(true);
    expect(
      canRequote(
        errandFixture({ status: 'QUOTED' }),
        quote({ expiresAt: '2026-10-09T00:00:00Z' }),
        now,
      ),
    ).toBe(false);
    expect(canRequote(errandFixture({ status: 'PAYMENT_CONFIRMED' }), quote(), now)).toBe(false);
  });

  it('offers it on an expired ACCEPTED quote too (row 72)', () => {
    expect(canRequote(errandFixture({ status: 'ACCEPTED' }), quote(), now)).toBe(true);
    expect(
      canRequote(
        errandFixture({ status: 'ACCEPTED' }),
        quote({ expiresAt: '2026-10-09T00:00:00Z' }),
        now,
      ),
    ).toBe(false);
  });
});

describe('customer quote request (row 68)', () => {
  it('is pending only when later than the newest quote, on QUOTED / ACCEPTED', () => {
    const q = quote({ createdAt: '2026-10-08T06:00:00Z' });
    const at = '2026-10-08T08:30:00Z';
    expect(pendingQuoteRequest(errandFixture({ quoteRequestedAt: at }), q)).toBe(at);
    expect(
      pendingQuoteRequest(errandFixture({ status: 'ACCEPTED', quoteRequestedAt: at }), q),
    ).toBe(at);
    expect(
      pendingQuoteRequest(
        errandFixture({ quoteRequestedAt: at }),
        quote({ createdAt: '2026-10-08T09:00:00Z' }),
      ),
    ).toBeNull();
    expect(
      pendingQuoteRequest(errandFixture({ status: 'CANCELLED', quoteRequestedAt: at }), q),
    ).toBeNull();
    expect(pendingQuoteRequest(errandFixture(), q)).toBeNull();
  });
});

describe('QuoteSectionComponent', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  async function render(status: Errand['status'], patch: Partial<Errand> = {}) {
    const fixture = TestBed.createComponent(QuoteSectionComponent);
    fixture.componentRef.setInput('errand', errandFixture({ status, ...patch }));
    fixture.detectChanges();
    return fixture;
  }
  type Errand = ReturnType<typeof errandFixture>;

  it('does not call the quote endpoint for REQUESTED', async () => {
    const fixture = await render('REQUESTED');
    http.expectNone(`${API}/errands/${errandFixture().id}/quote`);
    expect(fixture.nativeElement.textContent).not.toContain('Quote');
  });

  it('flags an expired quote and shows Issue new quote', async () => {
    const fixture = await render('QUOTED');
    http.expectOne(`${API}/errands/${errandFixture().id}/quote`).flush(quote());
    await flushAsync();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Quote expired');
    expect(text).toContain('Expired');
    const btn = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b) => (b as HTMLElement).textContent?.trim() === 'Issue new quote',
    ) as HTMLButtonElement;
    expect(btn.classList).toContain('btn-primary');
  });

  it('shows a pending customer request above Issue new quote on ACCEPTED (rows 68, 72)', async () => {
    const fixture = await render('ACCEPTED', { quoteRequestedAt: '2026-10-08T08:30:00Z' });
    http.expectOne(`${API}/errands/${errandFixture().id}/quote`).flush(quote());
    await flushAsync();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const text = (el.textContent as string).replace(/\s+/g, ' ');
    expect(text).toContain('New quote requested');
    expect(text).toContain('Customer asked for a new quote');
    expect(el.querySelector('.quote-request .num')?.textContent).toMatch(/11:30 AM/);
    expect(text).toContain('Issue new quote');
    expect(text).toContain(
      "This quote expired after the customer accepted it. They can't pay until it is re-quoted.",
    );
  });

  it('shows the wait hint for a valid quote', async () => {
    const fixture = await render('QUOTED');
    http
      .expectOne(`${API}/errands/${errandFixture().id}/quote`)
      .flush(quote({ expiresAt: '2099-01-01T00:00:00Z' }));
    await flushAsync();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('You can issue a new quote after this one expires at');
    expect(text).not.toContain('Issue new quote');
  });

  it('on 409 payment_in_progress reloads and explains (m-7)', async () => {
    const fixture = await render('ACCEPTED');
    http.expectOne(`${API}/errands/${errandFixture().id}/quote`).flush(quote());
    await flushAsync();
    const cmp = fixture.componentInstance as unknown as {
      onConflict(c: { error: unknown }): Promise<void>;
    };
    const done = cmp.onConflict({
      error: { status: 409, code: 'payment_in_progress', message: '', messages: [], extra: {} },
    });
    http
      .expectOne(`${API}/errands/${errandFixture().id}`)
      .flush(errandFixture({ status: 'ACCEPTED' }));
    http.expectOne(`${API}/errands/${errandFixture().id}/history`).flush([]);
    await flushAsync();
    http.expectOne(`${API}/errands/${errandFixture().id}/quote`).flush(quote());
    await done;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      "The customer has started paying this quote, so it can't be replaced now. Showing the latest.",
    );
  });

  it('on 409 quote_still_valid reloads the quote and explains', async () => {
    const fixture = await render('QUOTED');
    http.expectOne(`${API}/errands/${errandFixture().id}/quote`).flush(quote());
    await flushAsync();
    const cmp = fixture.componentInstance as unknown as {
      onConflict(c: { error: unknown }): Promise<void>;
    };
    const done = cmp.onConflict({
      error: {
        status: 409,
        code: 'quote_still_valid',
        message: '',
        messages: [],
        extra: { expiresAt: '2026-10-08T13:30:00Z' },
      },
    });
    http
      .expectOne(`${API}/errands/${errandFixture().id}/quote`)
      .flush(quote({ expiresAt: '2026-10-08T13:30:00Z' }));
    await done;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('The current quote is still valid until');
  });
});

describe('AdminDataService.quoteErrand (G-15)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  it('reads the { errand, history, quote } response and patches the queue row', async () => {
    const s = TestBed.inject(AdminDataService);
    const e = errandFixture({ status: 'REQUESTED', quotedPrice: null });
    s.errands.set([{ ...e }]);
    const p = s.quoteErrand(e.id, { total: 1450, expiresAt: '2026-10-09T12:00:00+03:00' });
    const req = http.expectOne(`${API}/errands/${e.id}/quote`);
    expect(req.request.body.total).toBe(1450);
    req.flush({
      errand: { ...e, status: 'QUOTED', quotedPrice: '1450.00' },
      history: null,
      quote: quote({ expiresAt: '2026-10-09T09:00:00Z' }),
    });
    await p;
    expect(s.errands()[0].status).toBe('QUOTED');
    expect(s.errands()[0].quotedPrice).toBe('1450.00');
    expect(s.errands()[0].quoteExpiresAt).toBe('2026-10-09T09:00:00Z');
  });

  it('throws the A-14 error shape', async () => {
    const s = TestBed.inject(AdminDataService);
    const p = s.quoteErrand('x', { total: 1, expiresAt: '2026-10-09T12:00:00+03:00' });
    http
      .expectOne(`${API}/errands/x/quote`)
      .flush(
        { statusCode: 409, code: 'quote_still_valid', message: 'm', expiresAt: 'z' },
        { status: 409, statusText: 'Conflict' },
      );
    await expect(p).rejects.toMatchObject({ status: 409, code: 'quote_still_valid' });
  });
});
