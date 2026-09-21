import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
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

@Module({
  imports: [
    UsersModule,
    CustomersModule,
    RunnersModule,
    TypeOrmModule.forFeature([User, OtpCode]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
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
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    OtpService,
    JwtStrategy,
    ConsoleOtpSender,
    AfricasTalkingOtpSender,
    otpSenderProvider,
  ],
  exports: [AuthService],
})
export class AuthModule {}