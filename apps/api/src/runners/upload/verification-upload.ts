import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MulterModuleOptions } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiError } from '../../common/api-error';

/** Row 163 (owner, 2026-10-16): 10 MB per ID/selfie image. */
export const DEFAULT_ID_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The one source of the ID image size limit (review minor 6): `runnerVerification.maxUploadBytes`. */
export const idMaxUploadBytes = (config?: ConfigService): number => {
  const value = Number(config?.get<number>('runnerVerification.maxUploadBytes', DEFAULT_ID_MAX_UPLOAD_BYTES));
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_ID_MAX_UPLOAD_BYTES;
};

/**
 * Multer options for the runners module (memory storage, one file, the
 * configured limit). Multer stops reading the request at the limit, so an
 * oversized image is never handed to the service and nothing reaches
 * Cloudinary.
 */
export const verificationMulterOptions = (config: ConfigService): MulterModuleOptions => ({
  limits: { fileSize: idMaxUploadBytes(config), files: 1 },
});

export const documentTooLarge = (maxBytes: number): ApiError =>
  new ApiError(HttpStatus.PAYLOAD_TOO_LARGE, 'verification_document_too_large', 'The image is larger than the limit', {
    maxBytes,
  });

/**
 * Row 163: multer's 413 ("File too large") becomes
 * `{ statusCode: 413, code: 'verification_document_too_large', maxBytes }`.
 */
@Catch(PayloadTooLargeException)
@Injectable()
export class VerificationUploadTooLargeFilter implements ExceptionFilter {
  constructor(private readonly config: ConfigService) {}

  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const error = documentTooLarge(idMaxUploadBytes(this.config));
    host.switchToHttp().getResponse<Response>().status(error.getStatus()).json(error.getResponse());
  }
}
