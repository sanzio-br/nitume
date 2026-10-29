// NC§W9.15: CustomerErrandsApi, CustomerAddressesApi, NotificationsCountApi
// and apiErrorOf (customer-v-new-category §W5).
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CustomerAddressesApi } from './addresses.api';
import { CreateErrandBody, CustomerErrandsApi, apiErrorOf } from './errands.api';
import { NotificationsCountApi } from './notifications.api';
import { sendsCredentials } from '../../../../testing/customer';

const API = 'http://localhost:3000/api/v1';

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return {
    errands: TestBed.inject(CustomerErrandsApi),
    addresses: TestBed.inject(CustomerAddressesApi),
    notifications: TestBed.inject(NotificationsCountApi),
    http: TestBed.inject(HttpTestingController),
  };
}

const BODY: CreateErrandBody = {
  category: 'inspection',
  description: 'Check the apartment',
  budget: 0,
  locations: [{ pointType: 'task_site', lat: -4.04, lon: 39.7, addressText: 'Nyali, Mombasa', placeId: 'p1' }],
};

describe('customer data services (NC§W9.15)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('NC§W9.15 list. GET /errands with comma-separated statuses and the limit, no credentials flag', async () => {
    const { errands, http } = setup();
    const pending = errands.list(['REQUESTED', 'QUOTED', 'ACCEPTED'], 5);
    const req = http.expectOne(`${API}/errands?status=REQUESTED,QUOTED,ACCEPTED&limit=5`);
    expect(req.request.method).toBe('GET');
    expect(sendsCredentials(req)).toBe(false);
    req.flush({ items: [], nextCursor: null });
    await expect(pending).resolves.toEqual({ items: [], nextCursor: null });
  });

  it('NC§W9.15 defaults. GET /errands/defaults', async () => {
    const { errands, http } = setup();
    const pending = errands.defaults();
    const req = http.expectOne(`${API}/errands/defaults`);
    expect(req.request.method).toBe('GET');
    expect(sendsCredentials(req)).toBe(false);
    req.flush({ defaultDeadlineHours: 24, defaultDeadlineStartsAt: 'payment_confirmed' });
    await expect(pending).resolves.toEqual({ defaultDeadlineHours: 24, defaultDeadlineStartsAt: 'payment_confirmed' });
  });

  it('NC§W9.15 create, submit, cancelDraft. exact URLs and bodies, ids URL-encoded, no Idempotency-Key', async () => {
    const { errands, http } = setup();
    void errands.create(BODY);
    const create = http.expectOne(`${API}/errands`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(BODY);
    expect(sendsCredentials(create)).toBe(false);
    create.flush({ errand: { id: 'e/1' } });

    void errands.submit('e/1');
    const submit = http.expectOne(`${API}/errands/e%2F1/submit`);
    expect(submit.request.method).toBe('POST');
    expect(submit.request.body).toBeNull();
    submit.flush({ errand: { id: 'e/1' } });

    void errands.cancelDraft('e-2');
    const cancel = http.expectOne(`${API}/errands/e-2/status`);
    expect(cancel.request.method).toBe('PATCH');
    expect(cancel.request.body).toEqual({ to: 'CANCELLED' });
    expect(cancel.request.headers.has('Idempotency-Key')).toBe(false);
    expect(sendsCredentials(cancel)).toBe(false);
    cancel.flush({ errand: { id: 'e-2' } });
  });

  it('NC§W9.15 addresses and unread. GET /customers/me/addresses and /notifications/unread-count', async () => {
    const { addresses, notifications, http } = setup();
    const list = addresses.list();
    const a = http.expectOne(`${API}/customers/me/addresses`);
    expect(sendsCredentials(a)).toBe(false);
    a.flush([{ id: 'a1', label: 'Home', addressText: 'Kilimani', lat: -1.29, lon: 36.78 }]);
    await expect(list).resolves.toHaveLength(1);
    const unread = notifications.unread();
    const n = http.expectOne(`${API}/notifications/unread-count`);
    expect(sendsCredentials(n)).toBe(false);
    n.flush({ unread: 3 });
    await expect(unread).resolves.toBe(3);
  });

  it('NC§W9.15 apiErrorOf. reads code, pointType, a string or array message, and status 0', () => {
    setup();
    const http = (status: number, error: unknown) => new HttpErrorResponse({ status, error });
    expect(
      apiErrorOf(
        http(422, {
          statusCode: 422,
          code: 'location_outside_service_area',
          message: 'Outside',
          pointType: 'dropoff',
        }),
      ),
    ).toEqual({ status: 422, code: 'location_outside_service_area', message: 'Outside', pointType: 'dropoff' });
    expect(apiErrorOf(http(400, { statusCode: 400, message: ['description must be longer', 'x'] }))).toEqual({
      status: 400,
      code: null,
      message: 'description must be longer',
    });
    expect(apiErrorOf(http(400, { statusCode: 400, code: 'deadline_in_past', message: 'The deadline must be in the future' })).message).toBe(
      'The deadline must be in the future',
    );
    expect(apiErrorOf(http(0, new ProgressEvent('error')))).toEqual({ status: 0, code: null, message: null });
    expect(apiErrorOf(new TypeError('fetch failed'))).toEqual({ status: 0, code: null, message: null });
  });
});
