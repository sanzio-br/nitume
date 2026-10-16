import { PayloadTooLargeException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { idMaxUploadBytes, verificationMulterOptions, VerificationUploadTooLargeFilter } from './verification-upload';

const config = (value?: number) => ({ get: vi.fn((_k: string, fallback: number) => value ?? fallback) });

describe('ID image upload limit (row 163, review minor 6)', () => {
  it('reads the one config value, 10 MB by default', () => {
    expect(idMaxUploadBytes(config() as never)).toBe(10 * 1024 * 1024);
    expect(idMaxUploadBytes(config(1234) as never)).toBe(1234);
    expect(verificationMulterOptions(config(1234) as never)).toEqual({ limits: { fileSize: 1234, files: 1 } });
  });

  it('maps multer 413 to verification_document_too_large with maxBytes', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) };
    new VerificationUploadTooLargeFilter(config(500) as never).catch(new PayloadTooLargeException(), host as never);
    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 413, code: 'verification_document_too_large', maxBytes: 500 }),
    );
  });
});
