import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsoleMpesaProvider } from './console.provider';
import { DarajaMpesaProvider, darajaConfigFrom } from './daraja.provider';
import { MpesaProvider } from './mpesa-provider';
import { PayHeroMpesaProvider, payHeroConfigFrom } from './payhero.provider';

export const MPESA_PROVIDER = 'MPESA_PROVIDER';

export type MpesaProviderName = 'console' | 'payhero' | 'daraja';

/**
 * Active M-Pesa provider from `payments.provider` (PAYMENTS_PROVIDER, row
 * 73). A real provider without its full configuration refuses to start:
 * never fall back silently to the console mock when real money is expected.
 */
export const mpesaProviderFactory = {
  provide: MPESA_PROVIDER,
  inject: [ConfigService, ConsoleMpesaProvider],
  useFactory: (config: ConfigService, consoleProvider: ConsoleMpesaProvider): MpesaProvider => {
    const name = config.get<MpesaProviderName>('payments.provider', 'console');
    switch (name) {
      case 'payhero': {
        const cfg = payHeroConfigFrom(config);
        if (!cfg) {
          throw new Error(
            'PAYMENTS_PROVIDER=payhero needs PAYHERO_BASE_URL, PAYHERO_AUTH_TOKEN, ' +
              'PAYHERO_CHANNEL_ID and PAYHERO_CALLBACK_URL (owner-approved account).',
          );
        }
        return new PayHeroMpesaProvider(cfg);
      }
      case 'daraja': {
        const cfg = darajaConfigFrom(config);
        if (!cfg) {
          throw new Error(
            'PAYMENTS_PROVIDER=daraja needs PAYMENTS_MPESA_CONSUMER_KEY, ' +
              'PAYMENTS_MPESA_CONSUMER_SECRET, PAYMENTS_MPESA_SHORTCODE, ' +
              'PAYMENTS_MPESA_PASSKEY and PAYMENTS_MPESA_CALLBACK_URL (owner-approved account).',
          );
        }
        return new DarajaMpesaProvider(cfg);
      }
      case 'console':
        // Row 89: production refuses to start on the mock (validateEnv fails
        // first; this guards a factory built outside ConfigModule).
        if (config.get<string>('nodeEnv') === 'production') {
          throw new Error(
            'PAYMENTS_PROVIDER=console is not allowed when NODE_ENV=production.',
          );
        }
        new Logger('MpesaProvider').warn(
          'PAYMENTS_PROVIDER=console: STK pushes are mocked and mock callbacks are trusted (non-production only).',
        );
        return consoleProvider;
      default:
        throw new Error(`Unknown PAYMENTS_PROVIDER '${String(name)}' (console | payhero | daraja)`);
    }
  },
};
