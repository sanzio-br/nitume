import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { RunnerVerificationType, VerificationStatus } from '../common/enums';
import { RunnerVerification } from './runner-verification.entity';
import { VerificationDocumentAction } from './verification-document-access-log.entity';
import { RunnersService } from './runners.service';

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof ApiError ? e.code : String(e)),
  );

const build = (dueIds: string[] = [], clockAt: Date | null = null) => {
  const rows: RunnerVerification[] = [];
  const log: {
    action: VerificationDocumentAction;
    actorUserId: string | null;
    ip: string | null;
    verificationId: string;
    note?: string | null;
  }[] = [];
  const verificationRepo = {
    create: vi.fn((v: Partial<RunnerVerification>) => v),
    save: vi.fn((v: RunnerVerification) => {
      const row = Object.assign(new RunnerVerification(), { status: VerificationStatus.PENDING, purgedAt: null }, v, {
        id: v.id ?? `v-${rows.length + 1}`,
        createdAt: new Date(),
      });
      rows.push(row);
      return Promise.resolve(row);
    }),
    findOne: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(rows.find((r) => r.id === where.id) ?? null)),
    update: vi.fn((where: { id: string }, patch: Partial<RunnerVerification>) => {
      const row = rows.find((r) => r.id === where.id && !r.purgedAt);
      if (row) {
        Object.assign(row, patch);
      }
      return Promise.resolve({ affected: row ? 1 : 0 });
    }),
    query: vi.fn((sql: string) =>
      Promise.resolve(
        sql.includes('SELECT at FROM clock')
          ? [{ at: clockAt }]
          : dueIds.map((id) => ({ id, runnerProfileId: 'rp-1' })),
      ),
    ),
  };
  const logRepo = {
    create: vi.fn((v: object) => v),
    save: vi.fn((v: (typeof log)[number]) => {
      log.push(v);
      return Promise.resolve({ ...v, id: `log-${log.length}`, createdAt: new Date() });
    }),
  };
  const managerQuery = vi.fn((sql: string, params: unknown[]) => {
    if (sql.includes('SELECT at FROM clock')) {
      return Promise.resolve([{ at: clockAt }]);
    }
    if (sql.includes('SET "note" = NULL')) {
      for (const l of log) {
        if (l.verificationId === params[0] && l.action === 're_review') {
          l.note = null;
        }
      }
    }
    return Promise.resolve([]);
  });
  const manager = {
    getRepository: (e: { name: string }) => (e.name === 'VerificationDocumentAccessLog' ? logRepo : verificationRepo),
    query: managerQuery,
  };
  const verifications = {
    ...verificationRepo,
    manager: { ...manager, transaction: vi.fn((fn: (m: unknown) => unknown) => fn(manager)) },
  };
  const profiles = { findOne: vi.fn(() => Promise.resolve({ id: 'rp-1', userId: 'u-run' })) };
  const storage = {
    upload: vi.fn(() => Promise.resolve({ key: 'vdoc:jpg:nitume/runner-verification/rp1/k1' })),
    viewUrl: vi.fn((_k: string, ttl: number) => ({ url: 'https://signed', expiresAt: new Date(Date.now() + ttl * 1000) })),
    destroy: vi.fn(() => Promise.resolve()),
  };
  const config = { get: vi.fn((_k: string, fallback: unknown) => fallback) };
  const service = new RunnersService(
    profiles as never,
    verifications as never,
    {} as never,
    {} as never,
    { displayNames: vi.fn(() => Promise.resolve(new Map([['admin-1', 'Verifier']]))) } as never,
    storage as never,
    config as never,
  );
  return { service, rows, log, storage, verificationRepo };
};

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const image = { buffer: jpegBytes, mimetype: 'image/jpeg', size: jpegBytes.length };

describe('RA-7 / row 154: restricted ID and selfie images', () => {
  it('uploads to restricted storage, creates a pending verification, logs the upload and hides the key', async () => {
    const b = build();
    const view = await b.service.uploadVerificationDocument('u-run', RunnerVerificationType.GOVERNMENT_ID, image, '10.0.0.7', 'front');
    expect(view).toMatchObject({ verificationType: 'government_id', side: 'front', status: 'pending', hasDocument: true, purgedAt: null });
    expect(view).not.toHaveProperty('documentS3Key');
    expect(b.rows[0].documentS3Key).toBe('vdoc:jpg:nitume/runner-verification/rp1/k1');
    expect(b.log).toEqual([expect.objectContaining({ action: 'upload', actorUserId: 'u-run', ip: '10.0.0.7' })]);
  });

  it('refuses other types, other files, and client-supplied keys', async () => {
    const b = build();
    expect(await codeOf(b.service.uploadVerificationDocument('u-run', RunnerVerificationType.PHONE, image, null))).toBe(
      'verification_type_not_uploadable',
    );
    expect(
      await codeOf(
        b.service.uploadVerificationDocument('u-run', RunnerVerificationType.SELFIE, { ...image, mimetype: 'application/pdf' }, null),
      ),
    ).toBe('verification_document_type_invalid');
    // Review minor 4: a PDF (or anything) sent as image/jpeg is refused by its bytes.
    const pdfAsJpeg = { buffer: Buffer.from('%PDF-1.7'), mimetype: 'image/jpeg', size: 8 };
    expect(await codeOf(b.service.uploadVerificationDocument('u-run', RunnerVerificationType.SELFIE, pdfAsJpeg, null))).toBe(
      'verification_document_type_invalid',
    );
    expect(b.storage.upload).not.toHaveBeenCalled();
    expect(await codeOf(b.service.uploadVerificationDocument('u-run', RunnerVerificationType.SELFIE, undefined, null))).toBe(
      'verification_document_empty',
    );
    expect(await codeOf(b.service.addVerification('u-run', RunnerVerificationType.PAYMENT_IDENTITY, 'someone-elses-key'))).toBe(
      'verification_document_upload_required',
    );
    expect(await codeOf(b.service.addVerification('u-run', RunnerVerificationType.SELFIE))).toBe(
      'verification_document_upload_required',
    );
  });

  it('issues a signed URL of at most 5 minutes to an admin and logs the view with the IP', async () => {
    const b = build();
    const v = await b.service.uploadVerificationDocument('u-run', RunnerVerificationType.SELFIE, image, null);
    const link = await b.service.documentLink(v.id, 'admin-1', '41.90.1.2');
    expect(link.url).toBe('https://signed');
    expect(b.storage.viewUrl).toHaveBeenCalledWith(expect.any(String), 300);
    expect(b.log[1]).toMatchObject({ action: 'view', actorUserId: 'admin-1', ip: '41.90.1.2', verificationId: v.id });
  });

  it('finds due images from the verification clock only (rows 161, 171)', async () => {
    const b = build(['v-1']);
    const now = new Date('2027-11-01T00:00:00Z');
    await expect(b.service.documentsDueForPurge(now)).resolves.toEqual([{ id: 'v-1', runnerProfileId: 'rp-1' }]);
    const [sql, params] = b.verificationRepo.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params).toEqual([now.toISOString(), 365, 200, null, [], []]);
    // Row 191: only ID/selfie rows, their decisions and re-reviews restart the clock.
    expect(sql).toContain(`MAX(v."createdAt") FILTER (WHERE v."verificationType"::text IN ('government_id', 'selfie'))`);
    expect(sql).toContain('NOT (v."runnerProfileId" = ANY($5::uuid[]))');
    expect(sql).toContain(`FILTER (WHERE v."verificationType"::text IN ('government_id', 'selfie'))`);
    expect(sql).toContain(`l.action::text = 're_review'`);
    expect(sql).not.toMatch(/errand_assignments|disputes|'view'/);
    expect(sql).toContain(`v.status::text <> 'pending'`);
  });

  it('purges: deletes the object, keeps only minimum metadata (notes cleared, row 170), logs it; then 410', async () => {
    const b = build([], new Date('2026-01-01T00:00:00Z'));
    await b.service.uploadVerificationDocument('u-run', RunnerVerificationType.GOVERNMENT_ID, image, null, 'front');
    b.log.push({ action: VerificationDocumentAction.RE_REVIEW, actorUserId: 'admin-1', ip: null, verificationId: 'v-1', note: 'kept until purge' });
    Object.assign(b.rows[0], {
      status: VerificationStatus.APPROVED,
      reviewerNote: 'Name matches the M-Pesa record',
      reviewedBy: 'admin-1',
      reviewedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const now = new Date('2027-11-01T00:00:00Z');
    await expect(b.service.purgeDocuments(['v-1'], now)).resolves.toEqual(['v-1']);
    expect(b.storage.destroy).toHaveBeenCalledWith('vdoc:jpg:nitume/runner-verification/rp1/k1');
    expect(b.rows[0]).toMatchObject({
      documentS3Key: null,
      reviewerNote: null,
      purgedAt: now,
      status: VerificationStatus.APPROVED,
      reviewedBy: 'admin-1',
      verificationType: RunnerVerificationType.GOVERNMENT_ID,
    });
    expect(b.log[1]).toMatchObject({ action: 're_review', note: null });
    expect(b.log[2]).toMatchObject({ action: 'purge', actorUserId: null });
    expect(await codeOf(b.service.documentLink('v-1', 'admin-1', null))).toBe('verification_document_purged');
    await expect(b.service.purgeDocuments(['v-1'], now)).resolves.toEqual([]);
  });

  it('never purges a pending verification, or one whose clock restarted meanwhile (rows 171, 175)', async () => {
    const now = new Date('2027-11-01T00:00:00Z');
    const pending = build([], new Date('2026-01-01T00:00:00Z'));
    await pending.service.uploadVerificationDocument('u-run', RunnerVerificationType.SELFIE, image, null);
    await expect(pending.service.purgeDocuments(['v-1'], now)).resolves.toEqual([]);
    const restarted = build([], new Date('2027-10-01T00:00:00Z'));
    await restarted.service.uploadVerificationDocument('u-run', RunnerVerificationType.SELFIE, image, null);
    restarted.rows[0].status = VerificationStatus.APPROVED;
    await expect(restarted.service.purgeDocuments(['v-1'], now)).resolves.toEqual([]);
    expect(restarted.storage.destroy).not.toHaveBeenCalled();
  });

  it('keeps the row when the storage deletion fails (retried next run)', async () => {
    const b = build([], new Date('2026-01-01T00:00:00Z'));
    await b.service.uploadVerificationDocument('u-run', RunnerVerificationType.SELFIE, image, null);
    b.rows[0].status = VerificationStatus.APPROVED;
    b.storage.destroy.mockRejectedValueOnce(new Error('cloud down'));
    await expect(b.service.purgeDocuments(['v-1'])).resolves.toEqual([]);
    expect(b.rows[0].documentS3Key).not.toBeNull();
  });

  it('re-review of decided evidence is logged and restarts the clock; not on pending, purged or imageless (row 171)', async () => {
    const b = build();
    const v = await b.service.uploadVerificationDocument('u-run', RunnerVerificationType.GOVERNMENT_ID, image, null, 'front');
    expect(await codeOf(b.service.reReviewDocument(v.id, 'admin-1', null))).toBe('verification_not_decided');
    b.rows[0].status = VerificationStatus.APPROVED;
    const out = await b.service.reReviewDocument(v.id, 'admin-1', '41.90.1.2', '  Second check after a fraud flag  ');
    expect(out).toEqual({
      verificationId: v.id,
      reReview: {
        id: 'log-2',
        reviewedBy: { id: 'admin-1', displayName: 'Verifier' },
        createdAt: expect.any(Date),
        note: 'Second check after a fraud flag',
      },
    });
    expect(b.log.at(-1)).toMatchObject({ action: 're_review', actorUserId: 'admin-1', ip: '41.90.1.2', verificationId: v.id });
    // 500 after trim is fine, 501 is not; whitespace-only is no note; the decision is unchanged.
    const padded = await b.service.reReviewDocument(v.id, 'admin-1', null, `  ${'n'.repeat(500)}  `);
    expect(padded.reReview.note).toHaveLength(500);
    expect(await codeOf(b.service.reReviewDocument(v.id, 'admin-1', null, 'n'.repeat(501)))).toBe('re_review_note_invalid');
    const bare = await b.service.reReviewDocument(v.id, 'admin-1', null, '   ');
    expect(bare.reReview.note).toBeNull();
    expect(b.rows[0].status).toBe(VerificationStatus.APPROVED);
    b.rows[0].documentS3Key = null;
    expect(await codeOf(b.service.reReviewDocument(v.id, 'admin-1', null))).toBe('verification_document_missing');
    b.rows[0].purgedAt = new Date();
    expect(await codeOf(b.service.reReviewDocument(v.id, 'admin-1', null))).toBe('verification_document_purged');
  });

  it('deletes the stored image again when the row cannot be written (review minor 4)', async () => {
    const b = build();
    b.verificationRepo.save.mockRejectedValueOnce(new Error('db down'));
    await expect(
      b.service.uploadVerificationDocument('u-run', RunnerVerificationType.SELFIE, image, null),
    ).rejects.toThrow('db down');
    expect(b.storage.destroy).toHaveBeenCalledWith('vdoc:jpg:nitume/runner-verification/rp1/k1');
    expect(b.rows).toEqual([]);
  });
});

describe('matchesImageSignature (review minor 4)', () => {
  it('checks each allowed type by its first bytes', async () => {
    const { matchesImageSignature } = await import('./upload/verification-upload');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(8)]);
    expect(matchesImageSignature(jpegBytes, 'image/jpeg')).toBe(true);
    expect(matchesImageSignature(png, 'image/png')).toBe(true);
    expect(matchesImageSignature(webp, 'image/webp')).toBe(true);
    expect(matchesImageSignature(heic, 'image/heic')).toBe(true);
    expect(matchesImageSignature(png, 'image/jpeg')).toBe(false);
    expect(matchesImageSignature(Buffer.from('fake-jpeg-bytes'), 'image/jpeg')).toBe(false);
    expect(matchesImageSignature(Buffer.from('ftyp'), 'image/heic')).toBe(false);
  });
});

describe('ID side (row 195)', () => {
  it('requires front or back on a government ID, refuses a side on a selfie, before anything is stored', async () => {
    const b = build();
    for (const side of [undefined, '', 'left']) {
      expect(
        await codeOf(b.service.uploadVerificationDocument('u-run', RunnerVerificationType.GOVERNMENT_ID, image, null, side)),
      ).toBe('verification_document_side_invalid');
    }
    expect(
      await codeOf(b.service.uploadVerificationDocument('u-run', RunnerVerificationType.SELFIE, image, null, 'front')),
    ).toBe('verification_document_side_invalid');
    expect(b.storage.upload).not.toHaveBeenCalled();
    const back = await b.service.uploadVerificationDocument('u-run', RunnerVerificationType.GOVERNMENT_ID, image, null, 'BACK');
    expect(back.side).toBe('back');
    const selfie = await b.service.uploadVerificationDocument('u-run', RunnerVerificationType.SELFIE, image, null);
    expect(selfie.side ?? null).toBeNull();
  });
});
