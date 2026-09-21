import { Injectable, Logger } from '@nestjs/common';
import { EvidenceStorage } from './evidence-storage.interface';

export const randomKey = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Dev transport: logs the upload instead of persisting it. */
@Injectable()
export class ConsoleEvidenceStorage extends EvidenceStorage {
  readonly name = 'console';
  private readonly logger = new Logger(ConsoleEvidenceStorage.name);

  async upload(input: {
    data: Buffer;
    contentType: string;
    errandId: string;
  }): Promise<{ key: string; url: string }> {
    const key = `console:${randomKey()}`;
    this.logger.log(
      `[console] evidence upload suppressed (${input.contentType}, ${input.data.length} bytes) → key=${key}`,
    );
    return { key, url: '' };
  }
}