import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ErrandStatus } from '../common/enums';
import { Errand } from './errand.entity';
import { ErrandsService } from './errands.service';
import { Quote } from './quote.entity';

const errand = { id: 'e-1', customerId: 'cust-1', status: ErrandStatus.QUOTED } as Errand;
const quote = { id: 'q-2', errandId: 'e-1', baseFee: '300.00', total: '450.00' } as Quote;

const build = (opts: { quote?: Quote | null; ownerProfileId?: string }) => {
  const quotes = { findOne: vi.fn(() => Promise.resolve(opts.quote ?? null)) };
  const errands = {
    findOne: vi.fn(() => Promise.resolve(errand)),
    manager: {
      getRepository: () => ({
        findOne: () => Promise.resolve({ id: opts.ownerProfileId ?? 'cust-1' }),
      }),
    },
  };
  const service = new ErrandsService(
    {} as never,
    errands as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { emit: vi.fn() } as never,
    {} as never,
    quotes as never,
  );
  return { service, quotes };
};

const owner = { role: 'customer', userId: 'user-1' };

describe('ErrandsService.latestQuoteFor (A-5)', () => {
  it('returns the newest quote for the errand owner', async () => {
    const { service, quotes } = build({ quote });
    await expect(service.latestQuoteFor('e-1', owner)).resolves.toBe(quote);
    expect(quotes.findOne).toHaveBeenCalledWith({
      where: { errandId: 'e-1' },
      order: { createdAt: 'DESC' },
    });
  });

  it('404s while the errand has no quote', async () => {
    const { service } = build({ quote: null });
    await expect(service.latestQuoteFor('e-1', owner)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('403s for a customer who does not own the errand', async () => {
    const { service } = build({ quote, ownerProfileId: 'someone-else' });
    await expect(service.latestQuoteFor('e-1', owner)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
