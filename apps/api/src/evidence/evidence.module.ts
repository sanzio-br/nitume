import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErrandsModule } from '../errands/errands.module';
import { Errand } from '../errands/errand.entity';
import { ErrandAssignment } from '../errands/errand-assignment.entity';
import { RunnerProfile } from '../runners/runner-profile.entity';
import { Evidence } from './evidence.entity';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';
import { CloudinaryEvidenceStorage } from './evidence-storage/cloudinary-evidence-storage';
import { ConsoleEvidenceStorage } from './evidence-storage/console-evidence-storage';
import { evidenceStorageProvider } from './evidence-storage/evidence-storage.provider';

@Module({
  imports: [
    ErrandsModule,
    TypeOrmModule.forFeature([Evidence, Errand, ErrandAssignment, RunnerProfile]),
  ],
  controllers: [EvidenceController],
  providers: [
    EvidenceService,
    CloudinaryEvidenceStorage,
    ConsoleEvidenceStorage,
    evidenceStorageProvider,
  ],
  exports: [EvidenceService],
})
export class EvidenceModule {}