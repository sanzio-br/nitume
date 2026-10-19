import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ErrandsService } from '../errands/errands.service';
import { MAINTENANCE_QUEUE, PAYMENT_VERIFY_JOB } from '../infra/queue/queues';
import { PaymentsService } from '../payments/payments.service';
import { IdDocumentRetentionService } from './id-document-retention.service';

export const DISPUTE_WINDOW_JOB = 'dispute-window';
export const STK_RECONCILE_JOB = 'stk-reconcile';
export const OFFER_EXPIRY_JOB = 'offer-expiry';
/** Daily deletion of runner ID/selfie images past retention (row 154). */
export const ID_DOCUMENT_PURGE_JOB = 'id-document-purge';

/**
 * Scheduled system jobs (rows 26, 50, 52). Every write goes through the
 * owning module's service, so PostgreSQL stays the source of truth.
 */
@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    private readonly errands: ErrandsService,
    private readonly payments: PaymentsService,
    private readonly idDocuments: IdDocumentRetentionService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case DISPUTE_WINDOW_JOB:
        return this.disputeWindow();
      case OFFER_EXPIRY_JOB:
        return this.offerExpiry();
      case ID_DOCUMENT_PURGE_JOB:
        return this.idDocumentPurge();
      case STK_RECONCILE_JOB:
        return { resolved: await this.payments.resolveTimedOut() };
      case PAYMENT_VERIFY_JOB:
        return this.verifyPayment((job.data as { paymentId: string }).paymentId);
      default:
        this.logger.warn(`Unknown maintenance job ${job.name}`);
        return null;
    }
  }

  /**
   * Confirms a payment named by a provider callback with the provider's
   * status query (row 73). Still pending -> throw, so BullMQ retries with
   * backoff; after the last attempt the STK reconcile job takes over.
   */
  async verifyPayment(paymentId: string): Promise<{ paymentId: string; state: string | null }> {
    const state = await this.payments.verifyPayment(paymentId);
    if (state === 'pending') {
      throw new Error(`Payment ${paymentId} still pending at the provider; retrying`);
    }
    return { paymentId, state };
  }

  /**
   * Row 185 first: RUNNER_ASSIGNED tasks past their customer deadline go
   * EXPIRED (closing any open offer). Then lapsed offers: the assignment
   * expires, the task stays RUNNER_ASSIGNED (row 157). Then rows 201, 220:
   * PAYMENT_CONFIRMED tasks past their deadline are reported to ops (one
   * feed item per task, no state change).
   */
  async offerExpiry(): Promise<{ expired: string[]; deadlineExpired: string[]; paidPastDeadline: string[] }> {
    const deadlineExpired = await this.errands.expirePastDeadline();
    const expired = await this.errands.expireLapsedOffers();
    const paidPastDeadline = await this.errands.reportPaidPastDeadline();
    if (expired.length > 0 || deadlineExpired.length > 0) {
      this.logger.log(`Offer expiry: expired ${expired.length} offers, ${deadlineExpired.length} tasks past their deadline`);
    }
    return { expired, deadlineExpired, paidPastDeadline };
  }

  /** Rows 154, 161, 175: securely delete ID/selfie images past their retention period. */
  async idDocumentPurge(): Promise<{ purged: string[] }> {
    const purged = await this.idDocuments.purgeExpired();
    if (purged.length > 0) {
      this.logger.log(`ID document purge: deleted ${purged.length}`);
    }
    return { purged };
  }

  /** COMPLETED past the dispute window -> CONFIRMED, then CONFIRMED -> SETTLED. */
  async disputeWindow(): Promise<{ confirmed: string[]; settled: string[] }> {
    const confirmed = await this.errands.confirmPastDisputeWindow();
    const settled = await this.payments.settleConfirmed();
    if (confirmed.length > 0 || settled.length > 0) {
      this.logger.log(`Dispute window: confirmed ${confirmed.length}, settled ${settled.length}`);
    }
    return { confirmed, settled };
  }
}
