import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  MERCHANT_DETAILS_UPDATED_EVENT,
  MerchantDetailsUpdatedEvent,
} from '../errands/errands.service';
import {
  MERCHANT_DETAILS_CHANGED_EVENT,
  MerchantDetailsChangedEvent,
} from './payment-events';
import { PaymentsService } from './payments.service';

/**
 * Row 80: when an admin changes merchant Till/Paybill details on a task
 * whose merchant_direct payment has started, the customer is warned (never
 * blocked). The errands module only knows the details changed; this checks
 * the payment side and emits `merchant_details.changed` for the
 * notifications and realtime modules.
 */
@Injectable()
export class MerchantDetailsWatcher {
  private readonly logger = new Logger(MerchantDetailsWatcher.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent(MERCHANT_DETAILS_UPDATED_EVENT, { async: true })
  async onMerchantDetailsUpdated(event: MerchantDetailsUpdatedEvent): Promise<void> {
    if (!event.changed || !event.merchantDetailsUpdatedAt) {
      return;
    }
    try {
      if (!(await this.payments.merchantDirectStarted(event.errandId))) {
        return;
      }
      const out: MerchantDetailsChangedEvent = {
        errandId: event.errandId,
        merchantName: event.merchantName,
        tillNumber: event.tillNumber,
        paybillNumber: event.paybillNumber,
        accountReference: event.accountReference,
        merchantDetailsUpdatedAt: event.merchantDetailsUpdatedAt,
      };
      this.events.emit(MERCHANT_DETAILS_CHANGED_EVENT, out);
    } catch (err) {
      this.logger.error(
        `Could not check merchant payment for ${event.errandId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
