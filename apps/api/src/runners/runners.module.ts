import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { RunnersService } from './runners.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
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
    CloudinaryVerificationDocumentStorage,
    ConsoleVerificationDocumentStorage,
    verificationDocumentStorageProvider,
  ],
  exports: [RunnersService],
})
export class RunnersModule {}