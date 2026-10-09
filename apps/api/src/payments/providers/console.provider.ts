import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { MpesaCallbackDto } from '../dto/payment.dto';
import {
  MpesaProvider,
  ParsedCallback,
  ProviderPaymentRef,
  StkInitiateRequest,
  StkInitiateResult,
  StkQueryResult,
} from './mpesa-provider';

/**
 * Dev transport: mocks a successful M-Pesa STK push. No money moves. Its
 * callback is the internal mock shape `{ reference, resultCode, ... }`
 * (MpesaCallbackDto) and is trusted, so it is for local/e2e use only.
 */
@Injectable()
export class ConsoleMpesaProvider extends MpesaProvider {
  readonly name = 'console';
  private readonly logger = new Logger(ConsoleMpesaProvider.name);

  initiateStk(req: StkInitiateRequest): Promise<StkInitiateResult> {
    this.logger.log(
      `[console STK] push amount=${req.amountKes} reference=${req.reference} desc=${req.description}`,
    );
    return Promise.resolve({
      checkoutRequestId: `mock-${randomUUID()}`,
      transactionId: randomUUID(),
      providerReference: null,
    });
  }

  /** No provider behind the console transport: a push never resolves by query. */
  queryStatus(ref: ProviderPaymentRef): Promise<StkQueryResult> {
    this.logger.log(`[console STK] query ${ref.reference}: no provider status`);
    return Promise.resolve({ state: 'pending', resultCode: null, resultDesc: null });
  }

  parseCallback(body: unknown): ParsedCallback | null {
    const dto = plainToInstance(MpesaCallbackDto, body ?? {});
    if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length > 0) {
      return null;
    }
    return {
      reference: dto.reference,
      checkoutRequestId: null,
      providerReference: null,
      claimed: {
        state: dto.resultCode === 0 ? 'success' : 'failed',
        resultCode: dto.resultCode,
        resultDesc: dto.resultDesc ?? null,
        receiptNumber: dto.receiptNumber ?? null,
      },
      trusted: true,
    };
  }
}
