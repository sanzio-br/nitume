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

describe('EvidenceService runner uploads (RA-11, rows 121, 129)', () => {
  const build = (status: string, windowOpen = true) => {
    const evidenceRepo = {
      create: vi.fn((r: object) => r),
      save: vi.fn((r: object) => Promise.resolve({ id: 'ev-1', capturedAt: new Date(), ...r })),
      count: vi.fn(() => Promise.resolve(0)),
    };
    const errandsSvc = {
      isCurrentRunner: vi.fn(() => Promise.resolve(true)),
      assertReceiptWindowOpen: vi.fn(() =>
        windowOpen ? Promise.resolve() : Promise.reject(Object.assign(new Error('closed'), { code: 'reimbursement_window_closed' })),
      ),
      onRunnerCompletion: vi.fn(),
    };
    const storage = { upload: vi.fn(() => Promise.resolve({ key: 'k', url: '' })), viewUrl: vi.fn(() => ({ url: null, expiresAt: null })) };
    const service = new EvidenceService(
      evidenceRepo as never,
      { findOne: vi.fn(() => Promise.resolve({ id: 'e-1', status })) } as never,
      errandsSvc as never,
      storage as never,
      { emit: vi.fn() } as never,
      { get: (_k: string, d: unknown) => d } as never,
    );
    return { service, storage, errandsSvc, evidenceRepo };
  };
  const runner = { userId: 'u-r', role: UserRole.RUNNER };
  const body = (type: string, contentType = 'image/jpeg') => ({ type, contentType, data: Buffer.from('jpg').toString('base64') });
  const code = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as { code?: string }).code;

  it.each([
    ['photo', 'ARRIVED'],
    ['photo', 'IN_PROGRESS'],
    ['receipt', 'ARRIVED'],
    ['receipt', 'IN_PROGRESS'],
    ['receipt', 'AWAITING_CUSTOMER'],
    ['receipt', 'CANCELLED'],
    ['receipt', 'FAILED'],
  ])('accepts a %s in %s', async (type, status) => {
    const { service, storage } = build(status);
    await service.upload('e-1', body(type) as never, runner);
    expect(storage.upload).toHaveBeenCalled();
  });

  it.each([
    ['photo', 'RUNNER_EN_ROUTE'],
    ['photo', 'AWAITING_CUSTOMER'],
    ['photo', 'CANCELLED'],
    ['receipt', 'RUNNER_EN_ROUTE'],
    ['receipt', 'DISPUTED'],
    ['receipt', 'COMPLETED'],
  ])('refuses a %s in %s with evidence_not_allowed', async (type, status) => {
    const { service, storage } = build(status);
    expect(await code(service.upload('e-1', body(type) as never, runner))).toBe('evidence_not_allowed');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('refuses a late receipt after the 24 h window', async () => {
    const { service, storage } = build('CANCELLED', false);
    expect(await code(service.upload('e-1', body('receipt') as never, runner))).toBe('reimbursement_window_closed');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('refuses video and other types from runners (row 121)', async () => {
    const { service } = build('IN_PROGRESS');
    expect(await code(service.upload('e-1', body('video', 'video/mp4') as never, runner))).toBe('evidence_type_not_allowed');
    expect(await code(service.upload('e-1', body('photo', 'video/mp4') as never, runner))).toBe('evidence_type_not_allowed');
    expect(await code(service.upload('e-1', body('document', 'application/pdf') as never, runner))).toBe('evidence_type_not_allowed');
  });

  it('leaves customer and admin uploads unguarded', async () => {
    const { service, storage } = build('COMPLETED');
    await service.upload('e-1', body('video', 'video/mp4') as never, { userId: 'a-1', role: UserRole.ADMIN });
    expect(storage.upload).toHaveBeenCalled();
  });

  it('registers the completion check: a photo by the runner is required', async () => {
    const { service, errandsSvc, evidenceRepo } = build('IN_PROGRESS');
    service.onModuleInit();
    expect(errandsSvc.onRunnerCompletion).toHaveBeenCalled();
    await expect(service.missingForCompletion('e-1', 'u-r')).resolves.toEqual(['photo']);
    expect(evidenceRepo.count).toHaveBeenCalledWith({ where: { errandId: 'e-1', type: 'photo', uploadedBy: 'u-r' } });
    evidenceRepo.count.mockResolvedValueOnce(2);
    await expect(service.missingForCompletion('e-1', 'u-r')).resolves.toEqual([]);
  });
});
