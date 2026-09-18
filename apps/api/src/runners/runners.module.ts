import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RunnerProfile } from './runner-profile.entity';
import { RunnerServiceArea, RunnerSkillEntity } from './runner-skill.entity';
import { RunnerVerification } from './runner-verification.entity';
import { RunnersController } from './runners.controller';
import { RunnersService } from './runners.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RunnerProfile,
      RunnerVerification,
      RunnerSkillEntity,
      RunnerServiceArea,
    ]),
  ],
  controllers: [RunnersController],
  providers: [RunnersService],
  exports: [RunnersService],
})
export class RunnersModule {}