/**
 * Storage abstraction for evidence assets (photos/video/receipts captured by
 * a runner). The concrete transport is selected via `evidence.storageDriver`
 * (console in dev, cloudinary once credentials are configured). A real object
 * store (Cloudinary today, S3 later per §7.2) is a project-owner decision.
 */
export abstract class EvidenceStorage {
  abstract readonly name: string;

  /**
   * @returns the public `url` and the storage `key` to persist on the
   * evidence row. The key stays stable across reads; the url may rotate
   * (e.g. signed URLs).
   */
  abstract upload(input: {
    data: Buffer;
    contentType: string;
    errandId: string;
  }): Promise<{ key: string; url: string }>;
}