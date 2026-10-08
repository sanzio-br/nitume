import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { EvidenceStorage, SignedView } from './evidence-storage.interface';

export const randomKey = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

type ResourceType = 'image' | 'video' | 'raw';
type DeliveryType = 'upload' | 'authenticated' | 'private';

/** Where an asset lives in Cloudinary, enough to sign a download URL. */
export interface CloudinaryLocator {
  resourceType: ResourceType;
  deliveryType: DeliveryType;
  format: string;
  publicId: string;
}

const KEY_PREFIX = 'cld';

/** `cld:<deliveryType>:<resourceType>:<format>:<publicId>` (no schema change). */
export const encodeKey = (l: CloudinaryLocator): string =>
  [KEY_PREFIX, l.deliveryType, l.resourceType, l.format, l.publicId].join(':');

const RESOURCE_TYPES = new Set(['image', 'video', 'raw']);
const DELIVERY_TYPES = new Set(['upload', 'authenticated', 'private']);

/**
 * Locator from a stored key, or from the permanent URL kept by uploads made
 * before signed delivery (their key is the bare public id).
 */
export const locate = (key: string, legacyUrl: string | null): CloudinaryLocator | null => {
  const parts = key.split(':');
  if (parts[0] === KEY_PREFIX && parts.length >= 5) {
    const [, deliveryType, resourceType, format, ...rest] = parts;
    if (DELIVERY_TYPES.has(deliveryType) && RESOURCE_TYPES.has(resourceType)) {
      return {
        deliveryType: deliveryType as DeliveryType,
        resourceType: resourceType as ResourceType,
        format,
        publicId: rest.join(':'),
      };
    }
    return null;
  }
  const m = legacyUrl
    ? /^https?:\/\/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/(upload|authenticated|private)\/(?:s--[^/]+--\/)?(?:v\d+\/)?(.+)\.([A-Za-z0-9]+)$/.exec(
        legacyUrl,
      )
    : null;
  return m
    ? {
        resourceType: m[1] as ResourceType,
        deliveryType: m[2] as DeliveryType,
        publicId: m[3],
        format: m[4],
      }
    : null;
};

/**
 * Cloudinary-backed evidence storage. Requires `evidence.storageDriver` =
 * 'cloudinary' and CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY /
 * CLOUDINARY_API_SECRET in the environment. Uploads use authenticated
 * delivery, so the asset is never publicly reachable; viewers get an
 * expiring signed download URL (row 25). The server-side upload is already
 * signed with the API secret; direct client uploads are not offered.
 */
@Injectable()
export class CloudinaryEvidenceStorage extends EvidenceStorage {
  readonly name = 'cloudinary';
  private readonly logger = new Logger(CloudinaryEvidenceStorage.name);
  private configured = false;

  constructor(private readonly config: ConfigService) {
    super();
  }

  async upload(input: {
    data: Buffer;
    contentType: string;
    errandId: string;
  }): Promise<{ key: string; url: string }> {
    this.ensureConfigured();
    const resourceType: ResourceType = input.contentType.startsWith('video/') ? 'video' : 'image';
    try {
      const result = await cloudinary.uploader.upload(
        `data:${input.contentType};base64,${input.data.toString('base64')}`,
        {
          folder: `nitume/evidence/${input.errandId.replace(/[^a-zA-Z0-9]/g, '')}`,
          resource_type: resourceType,
          type: 'authenticated',
          public_id: randomKey(),
        },
      );
      this.logger.log(`[cloudinary] uploaded evidence → public_id=${result.public_id}`);
      return {
        key: encodeKey({
          deliveryType: 'authenticated',
          resourceType,
          format: result.format,
          publicId: result.public_id,
        }),
        // No permanent URL is stored for private assets.
        url: '',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new UnprocessableEntityException(
        `Cloudinary upload failed: ${message.slice(0, 300)}`,
      );
    }
  }

  viewUrl(
    key: string,
    legacyUrl: string | null,
    ttlSeconds: number,
    now: Date = new Date(),
  ): SignedView {
    const where = locate(key, legacyUrl);
    if (!where) {
      return { url: null, expiresAt: null };
    }
    this.ensureConfigured();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const url = cloudinary.utils.private_download_url(where.publicId, where.format, {
      resource_type: where.resourceType,
      type: where.deliveryType,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    });
    return { url, expiresAt };
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
        'Cloudinary evidence storage selected but CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET are not configured',
      );
    }
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    this.configured = true;
  }
}
