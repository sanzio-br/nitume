/**
 * Customer fee split of a quote: service fee + runner fee at the configured
 * placeholder rates (pricing.*, owner decision pending). One formula for the
 * STK charge and for the "Total (service + runner fee)" shown on lists
 * (row 34): component split stays internal.
 */
export interface FeeRates {
  serviceFeeRate: number;
  runnerFeeRate: number;
}

export interface Fees {
  serviceFee: number;
  runnerFee: number;
  total: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const feesFor = (quotedPrice: number, rates: FeeRates): Fees => {
  const serviceFee = round2(quotedPrice * rates.serviceFeeRate);
  const runnerFee = round2(quotedPrice * rates.runnerFeeRate);
  return { serviceFee, runnerFee, total: round2(serviceFee + runnerFee) };
};
