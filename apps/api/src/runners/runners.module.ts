import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { verificationMulterOptions } from './upload/verification-upload';
import { RunnerProfile } from './runner-profile.entity';
import { RunnerServiceArea, RunnerSkillEntity } from './runner-skill.entity';
import { RunnerVerification } from './runner-verification.entity';
import { VerificationDocumentAccessLog } from './verification-document-access-log.entity';
import {
  CloudinaryVerificationDocumentStorage,
  ConsoleVerificationDocumentStorage,
  verificationDocumentStorageProvider,
} from './verification-storage/verification-document-storage';
import { RunnersController } from './runners.controller';
import { RunnerPresenceService } from './runner-presence.service';
import { RunnersService } from './runners.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    // Row 163, review minor 6: the upload limit comes from config only.
    MulterModule.registerAsync({ inject: [ConfigService], useFactory: verificationMulterOptions }),
    TypeOrmModule.forFeature([
      RunnerProfile,
      RunnerVerification,
      VerificationDocumentAccessLog,
      RunnerSkillEntity,
      RunnerServiceArea,
    ]),
  ],
  controllers: [RunnersController],
  providers: [
    RunnersService,
    RunnerPresenceService,
    CloudinaryVerificationDocumentStorage,
    ConsoleVerificationDocumentStorage,
    verificationDocumentStorageProvider,
  ],
  exports: [RunnersService, RunnerPresenceService],
})
export class RunnersModule {}