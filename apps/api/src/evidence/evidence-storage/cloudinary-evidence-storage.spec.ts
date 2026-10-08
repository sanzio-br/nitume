import { describe, expect, it } from 'vitest';
import { CloudinaryEvidenceStorage, encodeKey, locate } from './cloudinary-evidence-storage';

const config = {
  get: (key: string) =>
    ({
      'evidence.cloudinary.cloudName': 'demo-cloud',
      'evidence.cloudinary.apiKey': '1234',
      'evidence.cloudinary.apiSecret': 'not-a-real-secret',
    })[key] ?? null,
};

describe('Cloudinary evidence locator', () => {
  it('round-trips the encoded key', () => {
    const where = {
      deliveryType: 'authenticated' as const,
      resourceType: 'image' as const,
      format: 'jpg',
      publicId: 'nitume/evidence/abc/k1',
    };
    expect(locate(encodeKey(where), null)).toEqual(where);
  });

  it('locates legacy public uploads from their stored URL', () => {
    expect(
      locate('nitume/evidence/abc/k1', 'https://res.cloudinary.com/demo/image/upload/v1712/nitume/evidence/abc/k1.png'),
    ).toEqual({ resourceType: 'image', deliveryType: 'upload', publicId: 'nitume/evidence/abc/k1', format: 'png' });
  });

  it('gives up on unknown keys', () => {
    expect(locate('console:xyz', null)).toBeNull();
  });
});

describe('CloudinaryEvidenceStorage.viewUrl (row 25)', () => {
  it('signs an expiring download URL for the asset', () => {
    const storage = new CloudinaryEvidenceStorage(config as never);
    const now = new Date('2026-10-08T10:00:00Z');
    const view = storage.viewUrl(
      encodeKey({ deliveryType: 'authenticated', resourceType: 'image', format: 'jpg', publicId: 'nitume/evidence/e1/k1' }),
      null,
      900,
      now,
    );
    expect(view.expiresAt).toEqual(new Date('2026-10-08T10:15:00Z'));
    const url = new URL(view.url as string);
    expect(url.hostname).toBe('api.cloudinary.com');
    expect(url.pathname).toContain('/demo-cloud/image/download');
    expect(url.searchParams.get('expires_at')).toBe(String(Math.floor(view.expiresAt!.getTime() / 1000)));
    expect(url.searchParams.get('type')).toBe('authenticated');
    expect(url.searchParams.get('signature')).toBeTruthy();
  });

  it('returns no URL for an asset it cannot locate', () => {
    const storage = new CloudinaryEvidenceStorage(config as never);
    expect(storage.viewUrl('console:abc', null, 900)).toEqual({ url: null, expiresAt: null });
  });
});
