import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

/** A short-lived signed link to a verification image (admin only). */
export interface SignedDocumentView {
  url: string | null;
  expiresAt: Date | null;
}

/**
 * Restricted storage for runner ID and selfie images (owner answers rows
 * 125, 144, 154; system design §10): separate from task evidence, never
 * public, viewed only through short-lived signed URLs issued to admins, and
 * deleted when the retention period ends.
 */
export abstract class VerificationDocumentStorage {
  abstract readonly name: string;
  abstract upload(input: { data: Buffer; contentType: string; runnerProfileId: string }): Promise<{ key: string }>;
  abstract viewUrl(key: string, ttlSeconds: number, now?: Date): SignedDocumentView;
  /** Deletes the stored object (and its derived versions). Resolves when gone or already absent. */
  abstract destroy(key: string): Promise<void>;
}

export const VERIFICATION_DOCUMENT_STORAGE = 'VERIFICATION_DOCUMENT_STORAGE';

/** Longest signed-URL lifetime allowed for ID images (row 154: at most 5 minutes). */
export const MAX_DOCUMENT_URL_TTL_SECONDS = 300;

const randomKey = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** `vdoc:<format>:<publicId>`; always `authenticated` image assets. */
const KEY_PREFIX = 'vdoc';
export const encodeDocumentKey = (format: string, publicId: string): string => `${KEY_PREFIX}:${format}:${publicId}`;
export const decodeDocumentKey = (key: string): { format: string; publicId: string } | null => {
  const [prefix, format, ...rest] = key.split(':');
  return prefix === KEY_PREFIX && format && rest.length > 0 ? { format, publicId: rest.join(':') } : null;
};

/**
 * Cloudinary, the app's existing object store (evidence uses it): images are
 * uploaded with `authenticated` delivery under their own folder
 * (`nitume/runner-verification/...`, never the evidence folder), viewed with
 * an expiring signed download URL and removed with `destroy` (invalidating
 * cached copies).
 */
@Injectable()
export class CloudinaryVerificationDocumentStorage extends VerificationDocumentStorage {
  readonly name = 'cloudinary';
  private readonly logger = new Logger(CloudinaryVerificationDocumentStorage.name);
  private configured = false;

  constructor(private readonly config: ConfigService) {
    super();
  }

  async upload(input: { data: Buffer; contentType: string; runnerProfileId: string }): Promise<{ key: string }> {
    this.ensureConfigured();
    try {
      const result = await cloudinary.uploader.upload(
        `data:${input.contentType};base64,${input.data.toString('base64')}`,
        {
          folder: `${this.folder()}/${input.runnerProfileId.replace(/[^a-zA-Z0-9]/g, '')}`,
          resource_type: 'image',
          type: 'authenticated',
          public_id: randomKey(),
        },
      );
      return { key: encodeDocumentKey(result.format, result.public_id) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new UnprocessableEntityException(`Verification upload failed: ${message.slice(0, 300)}`);
    }
  }

  viewUrl(key: string, ttlSeconds: number, now: Date = new Date()): SignedDocumentView {
    const where = decodeDocumentKey(key);
    if (!where) {
      return { url: null, expiresAt: null };
    }
    this.ensureConfigured();
    const ttl = Math.min(Math.max(1, ttlSeconds), MAX_DOCUMENT_URL_TTL_SECONDS);
    const expiresAt = new Date(now.getTime() + ttl * 1000);
    const url = cloudinary.utils.private_download_url(where.publicId, where.format, {
      resource_type: 'image',
      type: 'authenticated',
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    });
    return { url, expiresAt };
  }

  async destroy(key: string): Promise<void> {
    const where = decodeDocumentKey(key);
    if (!where) {
      return;
    }
    this.ensureConfigured();
    const result = (await cloudinary.uploader.destroy(where.publicId, {
      resource_type: 'image',
      type: 'authenticated',
      invalidate: true,
    })) as { result?: string };
    if (result?.result !== 'ok' && result?.result !== 'not found') {
      throw new Error(`Cloudinary destroy returned ${String(result?.result)}`);
    }
    this.logger.log(`[cloudinary] verification image deleted (${result.result})`);
  }

  private folder(): string {
    return this.config.get<string>('runnerVerification.cloudinaryFolder', 'nitume/runner-verification');
  }

  private ensureConfigured(): void {
    if (this.configured) {
      return;
    }
    const cloudName = this.config.get<string | null>('evidence.cloudinary.cloudName');
    const apiKey = this.config.get<string | null>('evidence.cloudinary.apiKey');
    const apiSecret = this.config.get<string | null>('evidence.cloudinary.apiSecret');
    if (!cloudName || !apiKey || !apiSecret) {
      throw new UnprocessableEntityException(
        'Cloudinary verification storage selected but CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET are not configured',
      );
    }
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    this.configured = true;
  }
}

/** Dev transport: stores nothing, serves nothing, deletes nothing. */
@Injectable()
export class ConsoleVerificationDocumentStorage extends VerificationDocumentStorage {
  readonly name = 'console';
  private readonly logger = new Logger(ConsoleVerificationDocumentStorage.name);

  async upload(input: { data: Buffer; contentType: string }): Promise<{ key: string }> {
    const key = `console:${randomKey()}`;
    this.logger.log(`[console] verification upload suppressed (${input.contentType}, ${input.data.length} bytes)`);
    return { key };
  }

  viewUrl(): SignedDocumentView {
    return { url: null, expiresAt: null };
  }

  async destroy(): Promise<void> {
    // Nothing was stored.
  }
}

export const verificationDocumentStorageProvider = {
  provide: VERIFICATION_DOCUMENT_STORAGE,
  inject: [ConfigService, CloudinaryVerificationDocumentStorage, ConsoleVerificationDocumentStorage],
  useFactory: (
    config: ConfigService,
    cloudinaryStorage: CloudinaryVerificationDocumentStorage,
    consoleStorage: ConsoleVerificationDocumentStorage,
  ): VerificationDocumentStorage =>
    config.get<string>('runnerVerification.storageDriver', 'console') === 'cloudinary' ? cloudinaryStorage : consoleStorage,
};
