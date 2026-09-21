import { ConfigService } from '@nestjs/config';
import { CloudinaryEvidenceStorage } from './cloudinary-evidence-storage';
import { ConsoleEvidenceStorage } from './console-evidence-storage';
import { EvidenceStorage } from './evidence-storage.interface';

export const EVIDENCE_STORAGE = 'EVIDENCE_STORAGE';

export const evidenceStorageProvider = {
  provide: EVIDENCE_STORAGE,
  inject: [ConfigService, CloudinaryEvidenceStorage, ConsoleEvidenceStorage],
  useFactory: (
    config: ConfigService,
    cloudinary: CloudinaryEvidenceStorage,
    consoleStorage: ConsoleEvidenceStorage,
  ): EvidenceStorage => {
    const driver = config.get<'console' | 'cloudinary'>(
      'evidence.storageDriver',
      'console',
    );
    return driver === 'cloudinary' ? cloudinary : consoleStorage;
  },
};