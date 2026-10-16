import { describe, expect, it, vi } from 'vitest';
import { IdDocumentRetentionService } from './id-document-retention.service';

describe('IdDocumentRetentionService (rows 161, 175, review minors 2, 3, 5)', () => {
  it('excludes held runners in the next page query and re-checks the hold in each purge', async () => {
    const pages = [
      [
        { id: 'v-1', runnerProfileId: 'rp-1' },
        { id: 'v-2', runnerProfileId: 'rp-2' },
      ],
      [{ id: 'v-3', runnerProfileId: 'rp-3' }],
      [],
    ];
    const runners = {
      documentsDueForPurge: vi.fn(() => Promise.resolve(pages.shift() ?? [])),
      purgeDocuments: vi.fn((ids: string[], _now: Date, _isHeld: unknown) => Promise.resolve(ids)),
    };
    const disputes = {
      runnersWithOpenDisputes: vi.fn((ids: string[]) => Promise.resolve(new Set(ids.filter((id) => id === 'rp-2')))),
    };
    const now = new Date('2027-11-01T00:00:00Z');
    const out = await new IdDocumentRetentionService(runners as never, disputes as never).purgeExpired(now);
    expect(out).toEqual(['v-1', 'v-3']);
    expect(runners.purgeDocuments).toHaveBeenNthCalledWith(1, ['v-1'], now, expect.any(Function));
    expect(runners.documentsDueForPurge).toHaveBeenNthCalledWith(2, now, 200, {
      onlyRunnerProfileIds: undefined,
      excludeRunnerProfileIds: ['rp-2'],
      excludeIds: [],
    });
    // The in-transaction re-check asks DisputesService with the manager.
    const isHeld = runners.purgeDocuments.mock.calls[0][2] as (r: string, m: unknown) => Promise<boolean>;
    await expect(isHeld('rp-2', { tx: true })).resolves.toBe(true);
    expect(disputes.runnersWithOpenDisputes).toHaveBeenLastCalledWith(['rp-2'], { tx: true });
  });

  it('skips rows that could not be purged instead of looping on them', async () => {
    const runners = {
      documentsDueForPurge: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'v-1', runnerProfileId: 'rp-1' }])
        .mockResolvedValueOnce([]),
      purgeDocuments: vi.fn(() => Promise.resolve([])),
    };
    const disputes = { runnersWithOpenDisputes: vi.fn(() => Promise.resolve(new Set())) };
    await expect(new IdDocumentRetentionService(runners as never, disputes as never).purgeExpired()).resolves.toEqual([]);
    expect(runners.documentsDueForPurge).toHaveBeenLastCalledWith(expect.any(Date), 200, expect.objectContaining({ excludeIds: ['v-1'] }));
  });

  it('does nothing when nothing is due', async () => {
    const runners = { documentsDueForPurge: vi.fn(() => Promise.resolve([])), purgeDocuments: vi.fn() };
    const disputes = { runnersWithOpenDisputes: vi.fn() };
    await expect(new IdDocumentRetentionService(runners as never, disputes as never).purgeExpired()).resolves.toEqual([]);
    expect(disputes.runnersWithOpenDisputes).not.toHaveBeenCalled();
  });
});
