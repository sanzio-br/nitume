// CheckoutApi (#8 A§5, A§6): the quote, checkout, M-Pesa and price-change
// calls of the four #8 views. HttpClient only: the #6 lazy interceptor adds
// the Bearer. No credentials flag, no extra interceptor. Errors are read
// with #7's `apiErrorOf` (by code, never by message).
//
// Money (owner WQ-27): service fee, runner fee and merchant amount stay
// separate string fields exactly as the API sends them. No type here merges
// them, and the initiate body carries no amount (the server computes it).
// Merchant numbers (OA-5, #28): never read from the errand view; the only
// numbers the web declares are on `MerchantPaymentView`, read from
// `GET /payments/:errandId` by the item-payment page.
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_V1, ErrandView } from './errands.api';

const enc = encodeURIComponent;

export type MerchantRoute = 'merchant_direct' | 'send_to_runner';
export type StkStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'TIMEOUT';
export type PaymentFlow = 'merchant_direct' | 'customer_to_runner' | 'runner_advance' | 'platform_only';
export type PaymentStatus = 'pending' | 'authorized' | 'completed' | 'failed' | 'refunded';

/** `GET /errands/:id`: the #7 view plus the fields #8 reads (never the merchant fields, A§5). */
export interface CheckoutErrand extends ErrandView {
  readonly deadlineAt: string | null;
  /** Item amount, decimal string. */
  readonly budget: string;
  readonly quotedPrice: string | null;
  /** `Total (service + runner fee)`, null until quoted. */
  readonly feeTotal: string | null;
  readonly quoteExpiresAt: string | null;
  /** An open request for a new quote (row 68). */
  readonly quoteRequestedAt: string | null;
  /** ACCEPTED with an unaccepted re-quote (row 72). */
  readonly quoteAcceptanceRequired: boolean;
  readonly merchantDetailsAvailable: boolean;
  readonly outsideServiceArea?: boolean;
}

/** `GET /errands/:id/quote`: only these three fields are read (OA-4: no components). */
export interface Quote {
  readonly total: string;
  readonly expiresAt: string | null;
  readonly createdAt: string;
}

/** A payment record: the three flows as separate fields (WQ-27). */
export interface Payment {
  readonly id: string;
  readonly errandId: string;
  readonly serviceFee: string;
  readonly runnerFee: string;
  readonly merchantAmount: string;
  readonly paymentFlow: PaymentFlow;
  readonly status: PaymentStatus;
  readonly priceChangeRequestId: string | null;
  readonly createdAt: string;
}

export type MerchantPaymentView =
  | {
      readonly route: 'merchant_direct';
      readonly amount: string;
      readonly paidTo: 'merchant';
      readonly merchantName: string | null;
      /** Null for a customer until the fees are paid (#28). */
      readonly tillNumber: string | null;
      readonly paybillNumber: string | null;
      readonly accountReference: string | null;
      readonly merchantDetailsUpdatedAt: string | null;
      readonly merchantDetailsChangedAfterPayment: boolean;
    }
  | { readonly route: 'send_to_runner'; readonly amount: string; readonly paidTo: 'nitume' };

export interface DifferencePaymentView {
  readonly payment: Payment;
  readonly transactions: readonly unknown[];
  readonly stkStatus: StkStatus | null;
  readonly failureReason: string | null;
  readonly checkoutRequestId: string | null;
  readonly merchantPayment: MerchantPaymentView | null;
}

/** `GET /payments/:errandId`. */
export interface PaymentSummary {
  /** The main (service + runner fee) payment, newest. */
  readonly payment: Payment | null;
  readonly transactions: readonly unknown[];
  readonly stkStatus: StkStatus | null;
  readonly failureReason: string | null;
  readonly merchantDetailsAvailable: boolean;
  readonly merchantPayment: MerchantPaymentView | null;
  /** Price-change differences, newest first. */
  readonly differencePayments: readonly DifferencePaymentView[];
}

/** `POST /payments/:errandId/initiate`. */
export interface InitiateResult {
  readonly payment: Payment | null;
  readonly failureReason: string | null;
  readonly merchantDetailsAvailable: boolean;
  readonly reference: string | null;
  /** `'PAID' | 'FAILED' | 'PENDING'` on a stored payment. */
  readonly checkoutRequestId: string | null;
  readonly transactions: readonly unknown[];
  readonly stkStatus: StkStatus | null;
  readonly merchantPayment: MerchantPaymentView | null;
}

/** The initiate body: no amount, no fee field (WQ-27). */
export interface InitiateBody {
  merchantRoute?: MerchantRoute;
  paymentMethodId?: string;
}

export interface PriceChangeRequest {
  readonly id: string;
  readonly errandId: string;
  readonly fromPrice: string;
  readonly toPrice: string;
  readonly reason: string | null;
  readonly status: string;
  readonly createdAt: string;
}

export interface PriceChangeDecision extends PriceChangeRequest {
  readonly differencePayment: DifferencePaymentView | null;
  readonly refundReview: { readonly status: string } | null;
}

/** `GET /customers/me/payment-methods` (OA-10: M-Pesa only). */
export interface PaymentMethod {
  readonly id: string;
  readonly type: string;
  readonly label: string;
  /** Masked number, e.g. `+254 712 ••• 678`. */
  readonly detail: string | null;
  readonly phoneNumber: string | null;
  readonly isDefault: boolean;
}

export interface QuoteAccepted {
  readonly errand: CheckoutErrand;
  readonly quote: Quote;
}

@Injectable({ providedIn: 'root' })
export class CheckoutApi {
  private readonly http = inject(HttpClient);

  /** `GET /errands/:id`. */
  errand(id: string): Promise<CheckoutErrand> {
    return firstValueFrom(this.http.get<CheckoutErrand>(`${API_V1}/errands/${enc(id)}`));
  }

  /** `GET /errands/:id/quote`. */
  quote(id: string): Promise<Quote> {
    return firstValueFrom(this.http.get<Quote>(`${API_V1}/errands/${enc(id)}/quote`));
  }

  /** `POST /errands/:id/quote/accept` (no body; idempotent; accepts a re-quote on ACCEPTED). */
  acceptQuote(id: string): Promise<QuoteAccepted> {
    return firstValueFrom(this.http.post<QuoteAccepted>(`${API_V1}/errands/${enc(id)}/quote/accept`, null));
  }

  /** `POST /errands/:id/quote/request`. */
  requestQuote(id: string): Promise<CheckoutErrand> {
    return firstValueFrom(this.http.post<CheckoutErrand>(`${API_V1}/errands/${enc(id)}/quote/request`, null));
  }

  /** `PATCH /errands/:id { deadlineAt }` (UTC ISO of 23:59 EAT, or null for Flexible). */
  setDeadline(id: string, deadlineAt: string | null): Promise<CheckoutErrand> {
    return firstValueFrom(this.http.patch<CheckoutErrand>(`${API_V1}/errands/${enc(id)}`, { deadlineAt }));
  }

  /** `PATCH /errands/:id/status { to: 'CANCELLED' }`. */
  cancel(id: string): Promise<{ readonly errand: CheckoutErrand }> {
    return firstValueFrom(
      this.http.patch<{ readonly errand: CheckoutErrand }>(`${API_V1}/errands/${enc(id)}/status`, { to: 'CANCELLED' }),
    );
  }

  /** `GET /customers/me/payment-methods`; a failure is treated as `[]` (Flutter parity). */
  async paymentMethods(): Promise<PaymentMethod[]> {
    try {
      const methods = await firstValueFrom(this.http.get<PaymentMethod[]>(`${API_V1}/customers/me/payment-methods`));
      return Array.isArray(methods) ? methods : [];
    } catch {
      return [];
    }
  }

  /** `POST /payments/:errandId/initiate` with the attempt's `Idempotency-Key` (the only call that sends one). */
  initiate(errandId: string, body: InitiateBody, idempotencyKey: string): Promise<InitiateResult> {
    const out: InitiateBody = {};
    if (body.merchantRoute) out.merchantRoute = body.merchantRoute;
    if (body.paymentMethodId) out.paymentMethodId = body.paymentMethodId;
    return firstValueFrom(
      this.http.post<InitiateResult>(`${API_V1}/payments/${enc(errandId)}/initiate`, out, {
        headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
      }),
    );
  }

  /** `GET /payments/:errandId`. */
  payments(errandId: string): Promise<PaymentSummary> {
    return firstValueFrom(this.http.get<PaymentSummary>(`${API_V1}/payments/${enc(errandId)}`));
  }

  /** `POST /payments/:errandId/price-changes/:requestId/initiate` (no body). */
  retryDifference(errandId: string, requestId: string): Promise<DifferencePaymentView> {
    return firstValueFrom(
      this.http.post<DifferencePaymentView>(`${API_V1}/payments/${enc(errandId)}/price-changes/${enc(requestId)}/initiate`, null),
    );
  }

  /** `GET /errands/:id/price-change?status=requested`, newest first. */
  pendingPriceChanges(errandId: string): Promise<PriceChangeRequest[]> {
    return firstValueFrom(this.http.get<PriceChangeRequest[]>(`${API_V1}/errands/${enc(errandId)}/price-change?status=requested`));
  }

  /** `POST /errands/:id/price-change/:requestId/approve { merchantRoute? }`. */
  approvePriceChange(errandId: string, requestId: string, merchantRoute?: MerchantRoute): Promise<PriceChangeDecision> {
    return firstValueFrom(
      this.http.post<PriceChangeDecision>(
        `${API_V1}/errands/${enc(errandId)}/price-change/${enc(requestId)}/approve`,
        merchantRoute ? { merchantRoute } : {},
      ),
    );
  }

  /** `POST /errands/:id/price-change/:requestId/reject`. */
  rejectPriceChange(errandId: string, requestId: string): Promise<PriceChangeDecision> {
    return firstValueFrom(
      this.http.post<PriceChangeDecision>(`${API_V1}/errands/${enc(errandId)}/price-change/${enc(requestId)}/reject`, null),
    );
  }
}
