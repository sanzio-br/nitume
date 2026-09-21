import { ConfigService } from '@nestjs/config';
import { ConsoleStkGateway } from './console-stk-gateway';
import { StkGateway } from './stk-gateway.interface';

export const STK_GATEWAY = 'STK_GATEWAY';

export const stkGatewayProvider = {
  provide: STK_GATEWAY,
  inject: [ConfigService, ConsoleStkGateway],
  useFactory: (config: ConfigService, consoleGateway: ConsoleStkGateway): StkGateway => {
    const transport = config.get<'console' | 'daraja'>(
      'payments.mpesaTransport',
      'console',
    );
    if (transport === 'daraja') {
      // Wiring the real Daraja API (Lipa Na M-Pesa / B2C) needs live-or-sandbox
      // credentials that require explicit project-owner approval — never commit
      // or silently use a real account. Falls back to the console gateway.
      throw new Error(
        'payments.mpesaTransport=daraja requires owner-approved Daraja ' +
          'credentials and the PAYMENTS_MPESA_* secrets; keep it on console ' +
          '(dev/default) until then.',
      );
    }
    return consoleGateway;
  },
};