import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '../common/enums';
import { EvidenceService } from './evidence.service';

describe('EvidenceService views (row 25)', () => {
  it('lists evidence with a short-lived signed URL and no storage key', async () => {
    const row = {
      id: 'ev-1',
      errandId: 'e-1',
      type: 'photo',
      s3Key: 'cld:authenticated:image:jpg:nitume/evidence/e1/k1',
      url: null,
      capturedAt: new Date(),
      createdAt: new Date(),
    };
    const expiresAt = new Date(Date.now() + 900_000);
    const storage = { viewUrl: vi.fn(() => ({ url: 'https://signed', expiresAt })) };
    const service = new EvidenceService(
      { find: vi.fn(() => Promise.resolve([row])) } as never,
      { findOne: vi.fn(() => Promise.resolve({ id: 'e-1', customerId: 'c-1' })) } as never,
      { getCustomerProfileId: vi.fn(() => Promise.resolve('c-1')) } as never,
      storage as never,
      { emit: vi.fn() } as never,
      { get: (_k: string, d: unknown) => d } as never,
    );
    const [view] = await service.listForErrand('e-1', { userId: 'u-1', role: UserRole.CUSTOMER });
    expect(storage.viewUrl).toHaveBeenCalledWith(row.s3Key, null, 900);
    expect(view).toMatchObject({ id: 'ev-1', url: 'https://signed', urlExpiresAt: expiresAt });
    expect(view).not.toHaveProperty('s3Key');
  });
});
