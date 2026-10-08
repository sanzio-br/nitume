import { HttpErrorResponse } from '@angular/common/http';
import { apiError, isTransient } from './api-error';

describe('apiError (A-14)', () => {
  it('reads code, message and extra from the API body', () => {
    const err = new HttpErrorResponse({
      status: 400,
      error: {
        statusCode: 400,
        code: 'refund_exceeds_amount_paid',
        message: 'Refund cannot exceed the amount paid (KES 1200.00)',
        amountPaid: '1200.00',
      },
    });
    const e = apiError(err);
    expect(e.status).toBe(400);
    expect(e.code).toBe('refund_exceeds_amount_paid');
    expect(e.extra['amountPaid']).toBe('1200.00');
    expect(e.messages).toHaveLength(1);
  });

  it('keeps every class-validator message', () => {
    const err = new HttpErrorResponse({
      status: 400,
      error: {
        statusCode: 400,
        message: ['tillNumber must be 5-10 digits', 'merchantName must be longer'],
        error: 'Bad Request',
      },
    });
    const e = apiError(err);
    expect(e.code).toBeUndefined();
    expect(e.messages).toEqual(['tillNumber must be 5-10 digits', 'merchantName must be longer']);
    expect(e.extra).toEqual({});
  });

  it('treats a network failure as status 0 with no message', () => {
    const err = new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') });
    const e = apiError(err);
    expect(e.status).toBe(0);
    expect(e.message).toBe('');
    expect(isTransient(e)).toBe(true);
  });

  it('never exposes the HttpErrorResponse message', () => {
    const err = new HttpErrorResponse({ status: 500, url: '/x', error: null });
    const e = apiError(err);
    expect(e.message).toBe('');
    expect(isTransient(e)).toBe(true);
  });

  it('passes an already-normalised error through', () => {
    const info = { status: 409, code: 'x', message: '', messages: [], extra: {} };
    expect(apiError(info)).toBe(info);
  });
});
