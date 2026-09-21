import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { EvidenceStorage } from './evidence-storage.interface';

export const randomKey = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Cloudinary-backed evidence storage. Requires `evidence.storageDriver` =
 * 'cloudinary' and CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY /
 * CLOUDINARY_API_SECRET in the environment. Credentials are validated lazily
 * in `upload` (mirroring the Africa's Talking OTP sender), so selecting the
 * console driver never needs Cloudinary config.
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
    try {
      const result = await cloudinary.uploader.upload(
        `data:${input.contentType};base64,${input.data.toString('base64')}`,
        {
          folder: `nitume/evidence/${input.errandId.replace(/[^a-zA-Z0-9]/g, '')}`,
          resource_type: input.contentType.startsWith('video/') ? 'video' : 'image',
          public_id: randomKey(),
        },
      );
      this.logger.log(`[cloudinary] uploaded evidence → public_id=${result.public_id}`);
      return { key: result.public_id, url: result.secure_url };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new UnprocessableEntityException(
        `Cloudinary upload failed: ${message.slice(0, 300)}`,
      );
    }
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