import { describe, expect, it } from 'vitest';
import { DEFAULT_EVIDENCE_MAX_UPLOAD_BYTES, evidenceBodyLimitBytes, evidenceMaxUploadBytes, evidenceTooLarge } from './evidence-upload';

describe('evidence upload limit (row 252)', () => {
  it('defaults to 10 MB and follows evidence.maxUploadBytes', () => {
    expect(DEFAULT_EVIDENCE_MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
    expect(evidenceMaxUploadBytes()).toBe(DEFAULT_EVIDENCE_MAX_UPLOAD_BYTES);
    expect(evidenceMaxUploadBytes({ get: () => 2048 } as never)).toBe(2048);
    expect(evidenceMaxUploadBytes({ get: () => 0 } as never)).toBe(DEFAULT_EVIDENCE_MAX_UPLOAD_BYTES);
  });

  it('lets a base64 body of the largest file through, plus the other fields', () => {
    const max = 10 * 1024 * 1024;
    expect(evidenceBodyLimitBytes(max)).toBeGreaterThanOrEqual(Buffer.alloc(max).toString('base64').length + 1024);
  });

  it('codes the refusal 413 evidence_too_large with maxBytes', () => {
    const err = evidenceTooLarge(5);
    expect(err.getStatus()).toBe(413);
    expect(err.getResponse()).toMatchObject({ statusCode: 413, code: 'evidence_too_large', maxBytes: 5 });
  });
});
