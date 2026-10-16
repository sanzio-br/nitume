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

const startsWith = (buf: Buffer, bytes: number[], offset = 0): boolean =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

/**
 * Review minor 4: the file's first bytes must match the declared image type
 * (JPEG FF D8 FF; PNG 89 50 4E 47 0D 0A 1A 0A; WebP RIFF....WEBP; HEIC/HEIF
 * an ISO-BMFF `ftyp` box with a HEIF brand). The client's content type alone
 * is not trusted.
 */
export const matchesImageSignature = (buf: Buffer, contentType: string): boolean => {
  switch (contentType) {
    case 'image/jpeg':
      return startsWith(buf, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp':
      return startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8);
    case 'image/heic':
    case 'image/heif':
      return startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4) && HEIF_BRANDS.has(buf.subarray(8, 12).toString('latin1'));
    default:
      return false;
  }
};
