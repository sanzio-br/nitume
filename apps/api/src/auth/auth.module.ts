import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisService } from '../infra/redis/redis.service';
import { RedisThrottlerStorage } from '../infra/throttle/redis-throttler.storage';
import {
  OTP_REQUEST_THROTTLER,
  OTP_VERIFY_THROTTLER,
  OtpThrottlerGuard,
} from './otp-throttler.guard';
import { CustomersModule } from '../customers/customers.module';
import { RunnersModule } from '../runners/runners.module';
import { UsersModule } from '../users/users.module';
import { User } from '../users/user.entity';
import { OtpCode } from './otp-code.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { OtpService } from './otp.service';
import { AfricasTalkingOtpSender } from './otp-sender/africas-talking-otp-sender';
import { ConsoleOtpSender } from './otp-sender/console-otp-sender';
import { otpSenderProvider } from './otp-sender/otp-sender.provider';
import { TokenService } from './token.service';
import { RefreshCookieService } from './web/refresh-cookie.service';
import { WebAuthController } from './web/web-auth.controller';
import { WebOriginGuard } from './web/web-origin.guard';

@Module({
  imports: [
    UsersModule,
    CustomersModule,
    RunnersModule,
    TypeOrmModule.forFeature([User, OtpCode]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, RedisService],
      useFactory: (config: ConfigService, redis: RedisService) => ({
        throttlers: [
          {
            name: OTP_REQUEST_THROTTLER,
            limit: config.get<number>('otp.ipRequestLimit', 30),
            ttl: config.get<number>('otp.ipRequestWindowSeconds', 3600) * 1000,
          },
          {
            name: OTP_VERIFY_THROTTLER,
            limit: config.get<number>('otp.ipVerifyLimit', 60),
            ttl: config.get<number>('otp.ipVerifyWindowSeconds', 3600) * 1000,
          },
        ],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
        signOptions: {
          expiresIn: config.get<string>('jwt.accessTtl', '15m') as SignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController, WebAuthController],
  providers: [
    AuthService,
    TokenService,
    OtpService,
    JwtStrategy,
    ConsoleOtpSender,
    AfricasTalkingOtpSender,
    otpSenderProvider,
    OtpThrottlerGuard,
    RefreshCookieService,
    WebOriginGuard,
  ],
  exports: [AuthService],
})
export class AuthModule {}