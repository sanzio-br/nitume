import { describe, expect, it } from 'vitest';
import { ConsoleMpesaProvider } from './console.provider';
import { DarajaMpesaProvider } from './daraja.provider';
import { mpesaProviderFactory } from './mpesa-provider.factory';
import { PayHeroMpesaProvider } from './payhero.provider';

const config = (values: Record<string, unknown>) =>
  ({ get: (key: string, fallback?: unknown) => values[key] ?? fallback ?? null }) as never;

const payhero = {
  'payments.provider': 'payhero',
  'payments.payhero.baseUrl': 'https://payhero.test/api/v2',
  'payments.payhero.authToken': 'tok',
  'payments.payhero.channelId': 911,
  'payments.payhero.callbackUrl': 'https://api.test/cb',
};

describe('mpesaProviderFactory (row 73)', () => {
  const consoleProvider = new ConsoleMpesaProvider();

  it('defaults to the console mock', () => {
    expect(mpesaProviderFactory.useFactory(config({}), consoleProvider)).toBe(consoleProvider);
  });

  it('builds PayHero from config and refuses to start without it', () => {
    expect(mpesaProviderFactory.useFactory(config(payhero), consoleProvider)).toBeInstanceOf(
      PayHeroMpesaProvider,
    );
    expect(() =>
      mpesaProviderFactory.useFactory(
        config({ ...payhero, 'payments.payhero.authToken': null }),
        consoleProvider,
      ),
    ).toThrow(/PAYHERO_AUTH_TOKEN/);
  });

  it('keeps Daraja behind the same abstraction', () => {
    const daraja = {
      'payments.provider': 'daraja',
      'payments.daraja.consumerKey': 'k',
      'payments.daraja.consumerSecret': 's',
      'payments.daraja.shortCode': '174379',
      'payments.daraja.passkey': 'p',
      'payments.daraja.callbackUrl': 'https://api.test/cb',
    };
    expect(mpesaProviderFactory.useFactory(config(daraja), consoleProvider)).toBeInstanceOf(
      DarajaMpesaProvider,
    );
  });

  it('rejects an unknown provider', () => {
    expect(() =>
      mpesaProviderFactory.useFactory(config({ 'payments.provider': 'mystery' }), consoleProvider),
    ).toThrow(/Unknown PAYMENTS_PROVIDER/);
  });
});
