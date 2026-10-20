import { describe, expect, it, vi } from 'vitest';
import { OFFER_MADE_EVENT, OFFER_WITHDRAWN_EVENT } from '../errands/errands.service';
import { PRICE_CHANGE_DECIDED_EVENT } from '../matching/price-change.service';
import { PRICE_DIFFERENCE_PAID_EVENT } from '../payments/payment-events';
import { LocationRelay } from './location-relay';
import { DomainEvent } from './realtime.events';

const build = () => {
  const sub = {
    on: vi.fn(),
    psubscribe: vi.fn(() => Promise.resolve(1)),
    quit: vi.fn(() => Promise.resolve('OK')),
    disconnect: vi.fn(),
  };
  const redis = { createSubscriber: vi.fn(() => sub) };
  const ingest = { channelPattern: vi.fn(() => 'pfx:location:errand:*') };
  const gateway = { emitLocationUpdate: vi.fn() };
  const relay = new LocationRelay(redis as never, ingest as never, gateway as never);
  return { relay, sub, gateway };
};

describe('LocationRelay (§4.2 fan-out)', () => {
  it('subscribes to the prefixed location pattern and closes on shutdown', async () => {
    const { relay, sub } = build();
    await relay.onModuleInit();
    expect(sub.psubscribe).toHaveBeenCalledWith('pfx:location:errand:*');
    expect(sub.on).toHaveBeenCalledWith('pmessage', expect.any(Function));
    await relay.onModuleDestroy();
    expect(sub.quit).toHaveBeenCalled();
  });

  it('turns a published ping into location:update without the runner id', () => {
    const { relay, gateway } = build();
    relay.relay(JSON.stringify({ errandId: 'e-1', runnerProfileId: 'rp-1', lat: 1, lng: 2, accuracy: 5, ts: 't' }));
    expect(gateway.emitLocationUpdate).toHaveBeenCalledWith({ errandId: 'e-1', lat: 1, lng: 2, eta: null, accuracy: 5, ts: 't' });
  });

  it('drops malformed messages', () => {
    const { relay, gateway } = build();
    relay.relay('not json');
    relay.relay(JSON.stringify({ errandId: 'e-1', lat: 'x', lng: 2 }));
    expect(gateway.emitLocationUpdate).not.toHaveBeenCalled();
  });
});

describe('RA-5 domain event names', () => {
  it('match what the producers emit', () => {
    expect(DomainEvent.OFFER_MADE).toBe(OFFER_MADE_EVENT);
    expect(DomainEvent.OFFER_WITHDRAWN).toBe(OFFER_WITHDRAWN_EVENT);
    expect(DomainEvent.PRICE_CHANGE_DECIDED).toBe(PRICE_CHANGE_DECIDED_EVENT);
    expect(DomainEvent.PRICE_CHANGE_DIFFERENCE_PAID).toBe(PRICE_DIFFERENCE_PAID_EVENT);
  });
});
