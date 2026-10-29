import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AdminUsersController } from './admin-users.controller';
import { UserStatusService } from './user-status.service';

/** Ops dashboard endpoints (system design §3.1 `admin/`). */
@Module({
  imports: [UsersModule, AuthModule],
  controllers: [AdminUsersController],
  providers: [UserStatusService],
})
export class AdminModule {}
