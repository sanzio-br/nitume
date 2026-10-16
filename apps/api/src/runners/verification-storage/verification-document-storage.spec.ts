import { describe, expect, it } from 'vitest';
import {
  CloudinaryVerificationDocumentStorage,
  decodeDocumentKey,
  encodeDocumentKey,
} from './verification-document-storage';

const config = {
  get: (key: string, fallback?: unknown) =>
    ({
      'evidence.cloudinary.cloudName': 'demo-cloud',
      'evidence.cloudinary.apiKey': '1234',
      'evidence.cloudinary.apiSecret': 'not-a-real-secret',
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
