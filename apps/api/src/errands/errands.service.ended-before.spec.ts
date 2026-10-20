import { describe, expect, it, vi } from 'vitest';
import { ErrandStatus } from '../common/enums';
import { ErrandsService } from './errands.service';

describe('ErrandsService.endedBefore (row 247 location retention)', () => {
  const build = () => {
    const query = vi.fn(() => Promise.resolve([{ id: 'e-1' }]));
    const service = new ErrandsService(
      {} as never,
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { emit: vi.fn() } as never,
      {} as never,
      {} as never,
    );
    return { service, query };
  };

  it('asks only for terminal tasks that reached their state before the cutoff', async () => {
    const { service, query } = build();
    const cutoff = new Date('2026-07-22T00:00:00Z');
    await expect(service.endedBefore(['e-1', 'e-2', 'e-1'], cutoff)).resolves.toEqual(['e-1']);
    const [sql, params] = query.mock.calls[0] as unknown as [string, [string[], string[], string]];
    expect(sql).toMatch(/h\."toStatus" = e\.status/);
    expect(params[0]).toEqual(['e-1', 'e-2']);
    expect([...params[1]].sort()).toEqual(
      [ErrandStatus.CANCELLED, ErrandStatus.EXPIRED, ErrandStatus.FAILED, ErrandStatus.SETTLED].sort(),
    );
    expect(params[2]).toBe(cutoff.toISOString());
  });

  it('skips the query for no ids', async () => {
    const { service, query } = build();
    await expect(service.endedBefore([], new Date())).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
