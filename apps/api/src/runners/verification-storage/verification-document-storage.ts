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
 * Row 283 (AV-3): stored formats a desktop browser (Chrome, Edge, Firefox)
 * cannot display. The admin link for these asks Cloudinary's download API
 * for a JPEG (`format=jpg`), which Cloudinary converts on the fly as a
 * derived copy of the private original; the original is kept as uploaded.
 */
const BROWSER_SAFE_FORMAT: Record<string, string> = { heic: 'jpg', heif: 'jpg' };
export const viewFormatOf = (storedFormat: string): string => BROWSER_SAFE_FORMAT[storedFormat.toLowerCase()] ?? storedFormat;

/**
 * Cloudinary, the app's existing object store (evidence uses it): images are
 * uploaded with `authenticated` delivery under their own folder
 * (`nitume/runner-verification/...`, never the evidence folder), viewed with
 * an expiring signed download URL and removed with `destroy` (invalidating
 * cached copies).
 *
 * Row 162: every call passes the ID credential (`runnerVerification.cloudinary`,
 * CLOUDINARY_ID_*) explicitly; this class never touches the SDK's global
 * config, which the evidence storage owns, so the two keys never mix.
 * Uploads ask for `backup: false` (overrides the account's automatic backup
 * for these assets); `destroy` also deletes any backed-up versions first, so
 * a purged image cannot be restored from Cloudinary backups.
 *
 * Row 283: HEIC/HEIF originals are served as JPEG (`viewFormatOf`); the
 * purge deletes every derived copy (such as that JPEG) explicitly before
 * destroying the original, so no converted copy outlives it.
 */
@Injectable()
export class CloudinaryVerificationDocumentStorage extends VerificationDocumentStorage {
  readonly name = 'cloudinary';
  private readonly logger = new Logger(CloudinaryVerificationDocumentStorage.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async upload(input: { data: Buffer; contentType: string; runnerProfileId: string }): Promise<{ key: string }> {
    const credentials = this.credentials();
    try {
      const result = await cloudinary.uploader.upload(
        `data:${input.contentType};base64,${input.data.toString('base64')}`,
        {
          ...credentials,
          folder: `${this.folder()}/${input.runnerProfileId.replace(/[^a-zA-Z0-9]/g, '')}`,
          resource_type: 'image',
          type: 'authenticated',
          public_id: randomKey(),
          backup: false,
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
    const credentials = this.credentials();
    const ttl = Math.min(Math.max(1, ttlSeconds), MAX_DOCUMENT_URL_TTL_SECONDS);
    const expiresAt = new Date(now.getTime() + ttl * 1000);
    const url = cloudinary.utils.private_download_url(where.publicId, viewFormatOf(where.format), {
      ...credentials,
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
    const credentials = this.credentials();
    await this.deleteBackups(where.publicId, credentials);
    await this.deleteDerived(where.publicId, credentials);
    const result = (await cloudinary.uploader.destroy(where.publicId, {
      ...credentials,
      resource_type: 'image',
      type: 'authenticated',
      invalidate: true,
    })) as { result?: string };
    if (result?.result !== 'ok' && result?.result !== 'not found') {
      throw new Error(`Cloudinary destroy returned ${String(result?.result)}`);
    }
    this.logger.log(`[cloudinary] verification image deleted (${result.result})`);
  }

  /**
   * Row 162: removes every backed-up version of the asset (Admin API
   * `DELETE /resources/backup/:asset_id`). An asset uploaded with
   * `backup: false` normally has none; this covers older uploads and an
   * account where backup was forced on. Throws on failure, so the purge
   * keeps the row and retries the next day.
   */
  private async deleteBackups(publicId: string, credentials: CloudinaryCredentials): Promise<void> {
    let resource: { asset_id?: string; versions?: { version_id?: string }[] } | null;
    try {
      resource = (await cloudinary.api.resource(publicId, {
        ...credentials,
        resource_type: 'image',
        type: 'authenticated',
        versions: true,
      })) as { asset_id?: string; versions?: { version_id?: string }[] };
    } catch (err) {
      if ((err as { error?: { http_code?: number } })?.error?.http_code === 404) {
        return; // Already gone.
      }
      throw err;
    }
    const versionIds = (resource?.versions ?? []).map((v) => v.version_id).filter((v): v is string => !!v);
    if (!resource?.asset_id || versionIds.length === 0) {
      return;
    }
    const api = cloudinary.api as unknown as {
      delete_backed_up_assets: (assetId: string, versionIds: string[], options: object) => Promise<unknown>;
    };
    await api.delete_backed_up_assets(resource.asset_id, versionIds, credentials);
    this.logger.log(`[cloudinary] ${versionIds.length} backed-up version(s) of a verification image deleted`);
  }

  /**
   * Row 283: deletes every derived copy of the asset (the JPEG served for a
   * HEIC/HEIF original, or any other conversion) and invalidates their CDN
   * copies, keeping the original for the `destroy` that follows. `destroy`
   * also removes derived copies; this explicit step makes the purge not
   * depend on that. Throws on failure, and unless the reply says the asset
   * is `deleted` or `not_found` and is not `partial`, so the original is not
   * destroyed, the purge keeps the row and retries the next day.
   */
  private async deleteDerived(publicId: string, credentials: CloudinaryCredentials): Promise<void> {
    const reply = (await cloudinary.api.delete_resources([publicId], {
      ...credentials,
      resource_type: 'image',
      type: 'authenticated',
      keep_original: true,
      invalidate: true,
    })) as { deleted?: Record<string, string>; partial?: boolean } | undefined;
    // Only a clear answer lets the original go: anything else keeps the row for tomorrow's retry.
    const status = reply?.deleted?.[publicId];
    if (reply?.partial === true || (status !== 'deleted' && status !== 'not_found')) {
      throw new Error(
        `Cloudinary derived delete incomplete (status ${String(status)}${reply?.partial === true ? ', partial' : ''})`,
      );
    }
  }

  private folder(): string {
    return this.config.get<string>('runnerVerification.cloudinaryFolder', 'nitume/runner-verification');
  }

  private credentials(): CloudinaryCredentials {
    const cloudName = this.config.get<string | null>('runnerVerification.cloudinary.cloudName');
    const apiKey = this.config.get<string | null>('runnerVerification.cloudinary.apiKey');
    const apiSecret = this.config.get<string | null>('runnerVerification.cloudinary.apiSecret');
    if (!cloudName || !apiKey || !apiSecret) {
      throw new UnprocessableEntityException(
        'Cloudinary verification storage selected but CLOUDINARY_ID_API_KEY / CLOUDINARY_ID_API_SECRET (and a cloud name) are not configured',
      );
    }
    return { cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret };
  }
}

interface CloudinaryCredentials {
  cloud_name: string;
  api_key: string;
  api_secret: string;
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
