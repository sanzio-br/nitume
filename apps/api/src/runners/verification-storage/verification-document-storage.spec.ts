import { v2 as cloudinary } from 'cloudinary';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CloudinaryVerificationDocumentStorage,
  decodeDocumentKey,
  encodeDocumentKey,
} from './verification-document-storage';

const config = {
  get: (key: string, fallback?: unknown) =>
    ({
      'runnerVerification.cloudinary.cloudName': 'demo-cloud',
      'runnerVerification.cloudinary.apiKey': 'id-key-1234',
      'runnerVerification.cloudinary.apiSecret': 'not-a-real-secret',
    })[key] ?? fallback ?? null,
};

describe('restricted verification storage (rows 125, 154)', () => {
  it('round-trips the key', () => {
    const key = encodeDocumentKey('jpg', 'nitume/runner-verification/rp1/k1');
    expect(decodeDocumentKey(key)).toEqual({ format: 'jpg', publicId: 'nitume/runner-verification/rp1/k1' });
    expect(decodeDocumentKey('cld:authenticated:image:jpg:x')).toBeNull();
  });

  it('signs an authenticated download URL that expires within 5 minutes, even if asked for longer', () => {
    const storage = new CloudinaryVerificationDocumentStorage(config as never);
    const now = new Date('2026-10-16T10:00:00Z');
    const view = storage.viewUrl(encodeDocumentKey('jpg', 'nitume/runner-verification/rp1/k1'), 900, now);
    expect(view.expiresAt).toEqual(new Date('2026-10-16T10:05:00Z'));
    const url = new URL(view.url as string);
    expect(url.hostname).toBe('api.cloudinary.com');
    expect(url.searchParams.get('type')).toBe('authenticated');
    expect(url.searchParams.get('expires_at')).toBe(String(Math.floor(view.expiresAt!.getTime() / 1000)));
    expect(url.searchParams.get('signature')).toBeTruthy();
  });
});

describe('restricted credential and backups (row 162)', () => {
  afterEach(() => vi.restoreAllMocks());
  const key = encodeDocumentKey('jpg', 'nitume/runner-verification/rp1/k1');

  it('signs with the ID key and never sets the global SDK config', () => {
    const globalConfig = vi.spyOn(cloudinary, 'config');
    const view = new CloudinaryVerificationDocumentStorage(config as never).viewUrl(key, 60);
    expect(new URL(view.url as string).searchParams.get('api_key')).toBe('id-key-1234');
    expect(globalConfig).not.toHaveBeenCalled();
  });

  it('uploads with backup off and the ID credential', async () => {
    const upload = vi
      .spyOn(cloudinary.uploader, 'upload')
      .mockResolvedValue({ format: 'jpg', public_id: 'nitume/runner-verification/rp1/k2' } as never);
    const out = await new CloudinaryVerificationDocumentStorage(config as never).upload({
      data: Buffer.from([0xff, 0xd8, 0xff]),
      contentType: 'image/jpeg',
      runnerProfileId: 'rp-1',
    });
    expect(out.key).toBe('vdoc:jpg:nitume/runner-verification/rp1/k2');
    expect(upload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ backup: false, type: 'authenticated', api_key: 'id-key-1234', cloud_name: 'demo-cloud' }),
    );
  });

  it('deletes backed-up versions before destroying, and refuses without the ID credential', async () => {
    vi.spyOn(cloudinary.api, 'resource').mockResolvedValue({
      asset_id: 'asset-1',
      versions: [{ version_id: 'v1' }, { version_id: 'v2' }],
    } as never);
    const api = cloudinary.api as unknown as { delete_backed_up_assets: (...a: unknown[]) => Promise<unknown> };
    const backups = vi.spyOn(api, 'delete_backed_up_assets').mockResolvedValue({} as never);
    const destroy = vi.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' } as never);
    await new CloudinaryVerificationDocumentStorage(config as never).destroy(key);
    expect(backups).toHaveBeenCalledWith('asset-1', ['v1', 'v2'], expect.objectContaining({ api_key: 'id-key-1234' }));
    expect(destroy).toHaveBeenCalledWith(
      'nitume/runner-verification/rp1/k1',
      expect.objectContaining({ invalidate: true, type: 'authenticated', api_key: 'id-key-1234' }),
    );
    expect(backups.mock.invocationCallOrder[0]).toBeLessThan(destroy.mock.invocationCallOrder[0]);

    const bare = { get: (_k: string, fallback?: unknown) => fallback ?? null };
    await expect(new CloudinaryVerificationDocumentStorage(bare as never).destroy(key)).rejects.toThrow(/CLOUDINARY_ID_API_KEY/);
  });
});
