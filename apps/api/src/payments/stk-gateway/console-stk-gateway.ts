import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  StkGateway,
  StkPushRequest,
  StkPushResponse,
} from './stk-gateway.interface';

/** Dev transport: mocks a successful M-Pesa STK push in B2C/C2B shape. No
 * money moves — used for the local/e2e demo until a real (owner-approved)
 * Daraja account is wired. */
@Injectable()
export class ConsoleStkGateway extends StkGateway {
  readonly name = 'console';
  private readonly logger = new Logger(ConsoleStkGateway.name);

  async push(req: StkPushRequest): Promise<StkPushResponse> {
    const transactionId = randomUUID();
    const checkoutRequestId = `mock-${randomUUID()}`;
    this.logger.log(
      `[console STK] push phone=${req.phone} amount=${req.amountKes} ` +
        `reference=${req.reference} desc=${req.description}`,
    );
    return { checkoutRequestId, transactionId };
  }
}