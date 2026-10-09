import { ConfigService } from '@nestjs/config';
import { ConsoleStkGateway } from './console-stk-gateway';
import { DarajaStkGateway, darajaConfigFrom } from './daraja-stk-gateway';
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
      const daraja = darajaConfigFrom(config);
      if (!daraja) {
        // Never fall back silently to the console gateway with real money
        // expected: refuse to start until every credential is configured.
        throw new Error(
          'payments.mpesaTransport=daraja needs PAYMENTS_MPESA_CONSUMER_KEY, ' +
            'PAYMENTS_MPESA_CONSUMER_SECRET, PAYMENTS_MPESA_SHORTCODE, ' +
            'PAYMENTS_MPESA_PASSKEY and PAYMENTS_MPESA_CALLBACK_URL (owner-approved account).',
        );
      }
      return new DarajaStkGateway(daraja);
    }
    return consoleGateway;
  },
};
