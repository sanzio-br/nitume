/**
 * Storage abstraction for evidence assets (photos/video/receipts captured by
 * a runner). The concrete transport is selected via `evidence.storageDriver`
 * (console in dev, cloudinary once credentials are configured). A real object
 * store (Cloudinary today, S3 later per §7.2) is a project-owner decision.
 */
export interface SignedView {
  /** Short-lived signed URL, or null when the asset cannot be served. */
  url: string | null;
  expiresAt: Date | null;
}

export abstract class EvidenceStorage {
  abstract readonly name: string;

  /**
   * Stores the bytes privately. Returns the storage `key` to persist; `url`
   * is a permanent public URL only for legacy drivers and is empty for
   * private storage (row 25: no permanent public evidence URLs).
   */
  abstract upload(input: {
    data: Buffer;
    contentType: string;
    errandId: string;
  }): Promise<{ key: string; url: string }>;

  /**
   * Short-lived signed GET URL for a stored asset (row 25, ~15 minutes).
   * `legacyUrl` is the URL stored by older uploads, used to locate them.
   */
  abstract viewUrl(key: string, legacyUrl: string | null, ttlSeconds: number, now?: Date): SignedView;
}
