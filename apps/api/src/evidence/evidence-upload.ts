import { HttpStatus, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../common/api-error';

/** Row 252 (owner, 2026-10-20): 10 MB per evidence image, as for ID uploads (row 163). */
export const DEFAULT_EVIDENCE_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Room for the JSON keys and the other fields next to the base64 `data`. */
const JSON_OVERHEAD_BYTES = 64 * 1024;

/** The one source of the evidence size limit: `evidence.maxUploadBytes` (EVIDENCE_MAX_UPLOAD_BYTES). */
export const evidenceMaxUploadBytes = (config?: ConfigService): number => {
  const value = Number(config?.get<number>('evidence.maxUploadBytes', DEFAULT_EVIDENCE_MAX_UPLOAD_BYTES));
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_EVIDENCE_MAX_UPLOAD_BYTES;
};

/**
 * JSON body limit of the evidence route: the base64 size of the largest
 * allowed file plus the other fields. Every other route keeps the default
 * body limit (100 kB).
 */
export const evidenceBodyLimitBytes = (maxBytes: number): number => Math.ceil(maxBytes / 3) * 4 + JSON_OVERHEAD_BYTES;

export const evidenceTooLarge = (maxBytes: number): ApiError =>
  new ApiError(HttpStatus.PAYLOAD_TOO_LARGE, 'evidence_too_large', 'The file is larger than the limit', { maxBytes });

/**
 * Row 252: a JSON body parser for `POST /<prefix>/errands/:errandId/evidence`
 * only, with the evidence limit. It runs before Nest's default parser, which
 * then skips the already-read body. A body over the limit gets
 * `{ statusCode: 413, code: 'evidence_too_large', maxBytes }`. Call before
 * `app.init()` / `app.listen()` (main.ts, and e2e apps that upload large
 * evidence).
 */
export const applyEvidenceBodyLimit = (app: INestApplication, config: ConfigService, prefix = 'api/v1'): void => {
  const maxBytes = evidenceMaxUploadBytes(config);
  const parse = express.json({ limit: evidenceBodyLimitBytes(maxBytes) });
  const path = `/${prefix.replace(/^\/+|\/+$/g, '')}/errands/:errandId/evidence`;
  app.use(path, function evidenceJsonParser(req: Request, res: Response, next: NextFunction) {
    if (req.method !== 'POST') {
      next();
      return;
    }
    parse(req, res, (err?: unknown) => {
      if ((err as { type?: string } | undefined)?.type === 'entity.too.large') {
        const error = evidenceTooLarge(maxBytes);
        res.status(error.getStatus()).json(error.getResponse());
        return;
      }
      next(err as Error | undefined);
    });
  });
};
