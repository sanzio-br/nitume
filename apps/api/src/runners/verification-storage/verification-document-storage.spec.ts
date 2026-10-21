import { v2 as cloudinary } from 'cloudinary';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CloudinaryVerificationDocumentStorage,
  decodeDocumentKey,
  ConsoleVerificationDocumentStorage,
  encodeDocumentKey,
  viewFormatOf,
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
    vi.spyOn(cloudinary.api, 'delete_resources').mockResolvedValue({
      deleted: { 'nitume/runner-verification/rp1/k1': 'deleted' },
      partial: false,
    } as never);
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

describe('HEIC/HEIF shown as JPEG, derived copies purged (row 283, AV-3)', () => {
  afterEach(() => vi.restoreAllMocks());
  const storage = () => new CloudinaryVerificationDocumentStorage(config as never);

  it.each([
    ['heic', 'jpg'],
    ['HEIF', 'jpg'],
    ['heif', 'jpg'],
    ['jpg', 'jpg'],
    ['png', 'png'],
    ['webp', 'webp'],
  ])('stored %s is viewed as %s', (stored, viewed) => {
    expect(viewFormatOf(stored)).toBe(viewed);
  });

  it('signs the download of a HEIC/HEIF original with format=jpg, same expiry and public id', () => {
    for (const format of ['heic', 'heif']) {
      const view = storage().viewUrl(encodeDocumentKey(format, 'nitume/runner-verification/rp1/k3'), 300);
      const url = new URL(view.url as string);
      expect(url.searchParams.get('format')).toBe('jpg');
      expect(url.searchParams.get('public_id')).toBe('nitume/runner-verification/rp1/k3');
      expect(url.searchParams.get('type')).toBe('authenticated');
      expect(url.searchParams.get('signature')).toBeTruthy();
    }
  });

  it('keeps the stored format for browser-safe images', () => {
    const url = new URL(storage().viewUrl(encodeDocumentKey('png', 'nitume/runner-verification/rp1/k4'), 60).url as string);
    expect(url.searchParams.get('format')).toBe('png');
  });

  it('the purge deletes backups, then every derived copy (keep_original, invalidate), then the original', async () => {
    vi.spyOn(cloudinary.api, 'resource').mockResolvedValue({ asset_id: 'asset-9', versions: [{ version_id: 'v1' }] } as never);
    const api = cloudinary.api as unknown as { delete_backed_up_assets: (...a: unknown[]) => Promise<unknown> };
    const backups = vi.spyOn(api, 'delete_backed_up_assets').mockResolvedValue({} as never);
    const derived = vi.spyOn(cloudinary.api, 'delete_resources').mockResolvedValue({
      deleted: { 'nitume/runner-verification/rp1/k3': 'deleted' },
      partial: false,
    } as never);
    const destroy = vi.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' } as never);
    await storage().destroy(encodeDocumentKey('heic', 'nitume/runner-verification/rp1/k3'));
    expect(derived).toHaveBeenCalledWith(
      ['nitume/runner-verification/rp1/k3'],
      expect.objectContaining({
        keep_original: true,
        invalidate: true,
        type: 'authenticated',
        resource_type: 'image',
        api_key: 'id-key-1234',
      }),
    );
    expect(backups.mock.invocationCallOrder[0]).toBeLessThan(derived.mock.invocationCallOrder[0]);
    expect(derived.mock.invocationCallOrder[0]).toBeLessThan(destroy.mock.invocationCallOrder[0]);
  });

  it('a failed derived delete fails the purge (row kept, retried next day) and does not destroy the original', async () => {
    vi.spyOn(cloudinary.api, 'resource').mockResolvedValue({ asset_id: 'asset-9', versions: [] } as never);
    vi.spyOn(cloudinary.api, 'delete_resources').mockRejectedValue(new Error('rate limited'));
    const destroy = vi.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' } as never);
    await expect(storage().destroy(encodeDocumentKey('heic', 'nitume/runner-verification/rp1/k3'))).rejects.toThrow(/rate limited/);
    expect(destroy).not.toHaveBeenCalled();
  });

  const purgeWith = async (reply: unknown) => {
    vi.spyOn(cloudinary.api, 'resource').mockResolvedValue({ asset_id: 'asset-9', versions: [] } as never);
    vi.spyOn(cloudinary.api, 'delete_resources').mockResolvedValue(reply as never);
    const destroy = vi.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' } as never);
    const outcome = await storage()
      .destroy(encodeDocumentKey('heic', 'nitume/runner-verification/rp1/k3'))
      .then(
        () => null,
        (e: unknown) => e,
      );
    return { outcome, destroy };
  };

  it('M1: a partial derived delete throws and the original is not destroyed', async () => {
    const { outcome, destroy } = await purgeWith({
      deleted: { 'nitume/runner-verification/rp1/k3': 'deleted' },
      partial: true,
    });
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toMatch(/partial/);
    expect(destroy).not.toHaveBeenCalled();
  });

  it.each([[{ deleted: { 'nitume/runner-verification/rp1/k3': 'rate_limited' } }], [{ deleted: {} }], [{}], [undefined]])(
    'M1: an unexpected derived delete reply %j throws and the original is not destroyed',
    async (reply) => {
      const { outcome, destroy } = await purgeWith(reply);
      expect(outcome).toBeInstanceOf(Error);
      expect(destroy).not.toHaveBeenCalled();
    },
  );

  it('M1: not_found (no derived copy, or already gone) lets the purge destroy the original', async () => {
    const { outcome, destroy } = await purgeWith({
      deleted: { 'nitume/runner-verification/rp1/k3': 'not_found' },
      partial: false,
    });
    expect(outcome).toBeNull();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('the console driver still serves no URL', () => {
    expect(new ConsoleVerificationDocumentStorage().viewUrl()).toEqual({ url: null, expiresAt: null });
  });
});
