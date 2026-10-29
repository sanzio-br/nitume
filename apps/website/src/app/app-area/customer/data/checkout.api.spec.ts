// A.T5 (G8-6): CheckoutApi: methods, URLs (ids encoded), bodies, the
// Idempotency-Key only on the main initiate, no credentials flag,
// payment-methods failure → [], errors through apiErrorOf.
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { sendsCredentials } from '../../../../testing/customer';
import { CheckoutApi } from './checkout.api';
import { apiErrorOf } from './errands.api';

const API = 'http://localhost:3000/api/v1';

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { api: TestBed.inject(CheckoutApi), http: TestBed.inject(HttpTestingController) };
}

describe('CheckoutApi (A.T5, G8-6)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('A.T5 calls. every method hits its A§6 method and URL with the encoded id and the right body; no credentials, no Idempotency-Key', () => {
    const { api, http } = setup();
    const calls: [() => unknown, string, string, unknown][] = [
      [() => api.errand('e/1'), 'GET', `${API}/errands/e%2F1`, null],
      [() => api.quote('e/1'), 'GET', `${API}/errands/e%2F1/quote`, null],
      [() => api.acceptQuote('e/1'), 'POST', `${API}/errands/e%2F1/quote/accept`, null],
      [() => api.requestQuote('e/1'), 'POST', `${API}/errands/e%2F1/quote/request`, null],
      [() => api.setDeadline('e/1', '2026-11-01T20:59:00.000Z'), 'PATCH', `${API}/errands/e%2F1`, { deadlineAt: '2026-11-01T20:59:00.000Z' }],
      [() => api.setDeadline('e/1', null), 'PATCH', `${API}/errands/e%2F1`, { deadlineAt: null }],
      [() => api.cancel('e/1'), 'PATCH', `${API}/errands/e%2F1/status`, { to: 'CANCELLED' }],
      [() => api.payments('e/1'), 'GET', `${API}/payments/e%2F1`, null],
      [() => api.retryDifference('e/1', 'r/1'), 'POST', `${API}/payments/e%2F1/price-changes/r%2F1/initiate`, null],
      [() => api.pendingPriceChanges('e/1'), 'GET', `${API}/errands/e%2F1/price-change?status=requested`, null],
      [() => api.approvePriceChange('e/1', 'r/1'), 'POST', `${API}/errands/e%2F1/price-change/r%2F1/approve`, {}],
      [() => api.approvePriceChange('e/1', 'r/1', 'send_to_runner'), 'POST', `${API}/errands/e%2F1/price-change/r%2F1/approve`, { merchantRoute: 'send_to_runner' }],
      [() => api.rejectPriceChange('e/1', 'r/1'), 'POST', `${API}/errands/e%2F1/price-change/r%2F1/reject`, null],
    ];
    for (const [call, method, url, body] of calls) {
      void call();
      const req = http.expectOne(url);
      expect.soft(req.request.method, url).toBe(method);
      expect.soft(req.request.body, url).toEqual(body);
      expect.soft(sendsCredentials(req), url).toBe(false);
      expect.soft(req.request.headers.has('Idempotency-Key'), url).toBe(false);
      req.flush({});
    }
  });

  it('A.T5 initiate. POST /payments/:id/initiate with the Idempotency-Key header and only merchantRoute / paymentMethodId in the body', async () => {
    const { api, http } = setup();
    void api.initiate('e/1', { merchantRoute: 'send_to_runner', paymentMethodId: 'pm-1' }, 'key-12345678');
    let req = http.expectOne(`${API}/payments/e%2F1/initiate`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-12345678');
    expect(req.request.body).toEqual({ merchantRoute: 'send_to_runner', paymentMethodId: 'pm-1' });
    expect(sendsCredentials(req)).toBe(false);
    req.flush({});
    void api.initiate('e/1', {}, 'key-87654321');
    req = http.expectOne(`${API}/payments/e%2F1/initiate`);
    expect(req.request.body).toEqual({});
    req.flush({});
  });

  it('A.T5 payment methods. the list is returned; a failure resolves to []', async () => {
    const { api, http } = setup();
    let pending = api.paymentMethods();
    const method = { id: 'pm-1', type: 'mpesa', label: 'M-Pesa', detail: '+254 712 ••• 678', phoneNumber: '+254712345678', isDefault: true };
    http.expectOne(`${API}/customers/me/payment-methods`).flush([method]);
    await expect(pending).resolves.toEqual([method]);
    pending = api.paymentMethods();
    http.expectOne(`${API}/customers/me/payment-methods`).flush({ message: 'x' }, { status: 500, statusText: 'Error' });
    await expect(pending).resolves.toEqual([]);
  });

  it('A.T5 errors. a 409 surfaces its code through apiErrorOf; the message is not used', async () => {
    const { api, http } = setup();
    const pending = api.acceptQuote('e-1');
    http
      .expectOne(`${API}/errands/e-1/quote/accept`)
      .flush({ statusCode: 409, code: 'quote_expired', message: 'Quote expired' }, { status: 409, statusText: 'Conflict' });
    const err = await pending.catch((e: unknown) => apiErrorOf(e));
    expect(err).toEqual({ status: 409, code: 'quote_expired', message: 'Quote expired' });
  });
});
