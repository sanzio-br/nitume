import { describe, expect, it, vi } from 'vitest';
import { IdDocumentRetentionService } from './id-document-retention.service';

describe('IdDocumentRetentionService (rows 161, 175, review minor 5)', () => {
  it('purges due images except those of runners with an open dispute', async () => {
    const runners = {
      documentsDueForPurge: vi.fn(() =>
        Promise.resolve([
          { id: 'v-1', runnerProfileId: 'rp-1' },
          { id: 'v-2', runnerProfileId: 'rp-2' },
        ]),
      ),
      purgeDocuments: vi.fn((ids: string[]) => Promise.resolve(ids)),
    };
    const disputes = { runnersWithOpenDisputes: vi.fn(() => Promise.resolve(new Set(['rp-2']))) };
    const now = new Date('2027-11-01T00:00:00Z');
    const out = await new IdDocumentRetentionService(runners as never, disputes as never).purgeExpired(now);
    expect(disputes.runnersWithOpenDisputes).toHaveBeenCalledWith(['rp-1', 'rp-2']);
    expect(runners.purgeDocuments).toHaveBeenCalledWith(['v-1'], now);
    expect(out).toEqual(['v-1']);
  });

  it('does nothing when nothing is due', async () => {
    const runners = { documentsDueForPurge: vi.fn(() => Promise.resolve([])), purgeDocuments: vi.fn() };
    const disputes = { runnersWithOpenDisputes: vi.fn() };
    await expect(new IdDocumentRetentionService(runners as never, disputes as never).purgeExpired()).resolves.toEqual([]);
    expect(disputes.runnersWithOpenDisputes).not.toHaveBeenCalled();
  });
});
