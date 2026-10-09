import { describe, expect, it } from 'vitest';
import { PaymentStatus } from '../common/enums';
import { feesFor } from './fees';
import { failureReasonOf } from '../payments/payments.service';

describe('feesFor', () => {
  it('splits a quote into service and runner fee and totals them', () => {
    expect(feesFor(1000, { serviceFeeRate: 0.2, runnerFeeRate: 0.3 })).toEqual({
      serviceFee: 200,
      runnerFee: 300,
      total: 500,
    });
    expect(feesFor(333.33, { serviceFeeRate: 0.2, runnerFeeRate: 0.3 }).total).toBe(166.67);
  });
});

describe('failureReasonOf', () => {
  it('returns the provider ResultDesc of a FAILED charge only', () => {
    const legs = [{ rawCallback: { resultCode: 1032, resultDesc: 'Request cancelled by user' } }];
    expect(failureReasonOf({ status: PaymentStatus.FAILED }, legs)).toBe('Request cancelled by user');
    expect(failureReasonOf({ status: PaymentStatus.PENDING }, legs)).toBeNull();
    expect(failureReasonOf({ status: PaymentStatus.FAILED }, [{ rawCallback: null }])).toBeNull();
  });
});
